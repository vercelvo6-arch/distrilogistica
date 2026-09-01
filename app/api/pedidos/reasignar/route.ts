import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { pedidoId, nuevaPlanillaId } = body

    console.log('[API Reasignar Pedido] Datos recibidos:', {
      pedidoId,
      nuevaPlanillaId,
      usuario: session.user.nombre
    })

    if (!pedidoId || !nuevaPlanillaId) {
      return NextResponse.json(
        { error: 'Datos incompletos: se requiere pedidoId y nuevaPlanillaId' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // 1️⃣ Verificar que el pedido existe y obtener datos actuales
    const pedidoActual = await sql`
      SELECT 
        p.id,
        p.planilla_id as planilla_actual,
        p.cliente,
        p.total,
        p.estado,
        pl.tipo_ruta as ruta_actual,
        pl.entregador as entregador_actual
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.id = ${pedidoId}
    `

    if (pedidoActual.length === 0) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    const pedido = pedidoActual[0]

    // 2️⃣ Verificar que la nueva planilla existe
    const nuevaPlanilla = await sql`
      SELECT id, tipo_ruta, entregador, estado, cuadrado_en_caja
      FROM planillas
      WHERE id = ${nuevaPlanillaId}
    `

    if (nuevaPlanilla.length === 0) {
      return NextResponse.json({ error: 'Planilla destino no encontrada' }, { status: 404 })
    }

    const planilla = nuevaPlanilla[0]

    // 3️⃣ Validar que la planilla no esté cuadrada en caja
    if (planilla.cuadrado_en_caja) {
      return NextResponse.json(
        { error: 'No se puede reasignar a una planilla ya cuadrada en caja' },
        { status: 400 }
      )
    }

    // 4️⃣ Validar que no sea la misma planilla
    if (pedido.planilla_actual === nuevaPlanillaId) {
      return NextResponse.json(
        { error: 'El pedido ya está asignado a esa planilla' },
        { status: 400 }
      )
    }

    console.log('[API Reasignar Pedido] Moviendo pedido:', {
      pedido: pedido.cliente,
      estado_actual: pedido.estado,
      de: `${pedido.ruta_actual} - ${pedido.entregador_actual}`,
      a: `${planilla.tipo_ruta} - ${planilla.entregador}`
    })

    // ✅ Todo lo que sigue muta datos (pedido, pedido_productos, faltantes,
    // totales de 2 planillas). Sin transacción, un error a mitad de camino
    // (como el de faltantes_planilla_codigo_unique que vimos) deja el
    // pedido ya movido pero los totales de ambas planillas sin recalcular
    // — el cargue le queda "pegado" a la planilla origen. BEGIN/COMMIT
    // asegura que o se aplica todo, o no se aplica nada.
    await sql`BEGIN`

    try {

    // 5️⃣ Obtener la última secuencia de la planilla destino
    const ultimaSecuencia = await sql`
      SELECT COALESCE(MAX(secuencia), 0) as max_secuencia
      FROM pedidos
      WHERE planilla_id = ${nuevaPlanillaId}
    `

    const nuevaSecuencia = Number(ultimaSecuencia[0].max_secuencia) + 1
    const nuevoEstado = pedido.estado === 'repaso' ? 'pendiente' : pedido.estado

    // ✅ Solo si el pedido YA estaba resuelto (entregado/fiado/devolucion) la
    // mercancía salió físicamente con un entregador otro día. Si seguía
    // 'pendiente' (o era 'repaso', que vuelve a 'pendiente' arriba), nunca
    // se entregó nada — es un traslado administrativo antes de despachar, y
    // el alistador SÍ debe alistarlo de verdad. Marcarlo "completo" con la
    // nota de "ya cargado" en ese caso era el bug: el producto no viajaba,
    // pero quedaba marcado como si ya se hubiera alistado sin haberlo hecho.
    const mercanciaYaEntregada = ['entregado', 'fiado', 'devolucion'].includes(pedido.estado)

    // 6️⃣ Actualizar el pedido
    await sql`
      UPDATE pedidos
      SET
        planilla_id = ${nuevaPlanillaId},
        secuencia = ${nuevaSecuencia},
        estado = ${nuevoEstado},
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[API Reasignar Pedido] ✓ Pedido actualizado')

    let productosMarcados: any = []
    let faltantesActualizados: any = []

    if (mercanciaYaEntregada) {
      // ✅ Marcar la mercancía como ya alistada — este pedido se reasigna desde
      // el cuadre de caja, es decir, la mercancía ya salió cargada físicamente
      // hoy con el entregador. Si no se marca así, la lista de "Productos
      // Consolidados" del alistador vuelve a pedirla como pendiente en la
      // planilla destino y el alistador no la encuentra en bodega (no existe
      // ahí — ya está con el entregador).
      productosMarcados = await sql`
        UPDATE pedido_productos
        SET
          estado_alistamiento = 'completo',
          cantidad_disponible = cantidad,
          cantidad_faltante = 0,
          observaciones_faltante = COALESCE(observaciones_faltante || ' | ', '') ||
            'Ya cargado — reasignado desde ' || ${pedido.ruta_actual} || ' en cuadre de caja',
          updated_at = NOW()
        WHERE pedido_id = ${pedidoId}
        RETURNING id
      `

      console.log(`[API Reasignar Pedido] ✓ Productos marcados como ya alistados: ${productosMarcados.length}`)

      // ✅ Resolver (no re-asignar) los faltantes pendientes de la planilla
      // ORIGEN para los códigos de este pedido.
      //
      // Antes este bloque intentaba mover la fila (UPDATE planilla_id) a la
      // planilla destino, pero eso choca con faltantes_planilla_codigo_unique
      // (planilla_id, codigo) cuando la planilla destino ya tiene su propio
      // faltante pendiente para el mismo código — causaba un 500.
      //
      // Además ya no tiene sentido arrastrarlo: arriba marcamos los
      // pedido_productos de este pedido como 'completo' (mercancía ya
      // cargada), así que el faltante de origen queda resuelto, no movido.
      faltantesActualizados = await sql`
        UPDATE faltantes
        SET
          estado = 'resuelto',
          tipo_resolucion = 'completo',
          cantidad_resuelta = cantidad_faltante,
          cantidad_disponible = cantidad_solicitada,
          resuelto_por = ${session.user.id},
          fecha_resolucion = NOW(),
          observaciones_resolucion = 'Pedido reasignado a ' || ${planilla.tipo_ruta} || ' en cuadre de caja — mercancía ya cargada'
        WHERE planilla_id = ${pedido.planilla_actual}
          AND codigo IN (
            SELECT codigo FROM pedido_productos WHERE pedido_id = ${pedidoId}
          )
          AND estado = 'pendiente'
        RETURNING id
      `
    } else {
      console.log('[API Reasignar Pedido] Pedido seguía pendiente — se deja para alistamiento real, sin marcar como ya cargado')
    }

    console.log(`[API Reasignar Pedido] ✓ Faltantes de origen resueltos: ${faltantesActualizados.length}`)

    // 7️⃣ Recalcular totales planilla ORIGEN
    const totalesOrigen = await sql`
      SELECT 
        COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total ELSE 0 END), 0) as total_entregado,
        COALESCE(SUM(CASE WHEN estado = 'fiado' THEN total ELSE 0 END), 0) as total_fiado,
        COALESCE(SUM(CASE WHEN estado = 'repaso' THEN total ELSE 0 END), 0) as total_repaso,
        COALESCE(SUM(CASE WHEN estado = 'devolucion' THEN total ELSE 0 END), 0) as total_devolucion,
        COALESCE(SUM(total), 0) as total_cargue
      FROM pedidos
      WHERE planilla_id = ${pedido.planilla_actual}
    `

    await sql`
      UPDATE planillas
      SET 
        total_cargue = ${totalesOrigen[0].total_cargue},
        total_entregado = ${totalesOrigen[0].total_entregado},
        total_fiado = ${totalesOrigen[0].total_fiado},
        total_repaso = ${totalesOrigen[0].total_repaso},
        total_devolucion = ${totalesOrigen[0].total_devolucion},
        updated_at = NOW()
      WHERE id = ${pedido.planilla_actual}
    `

    console.log('[API Reasignar Pedido] ✓ Totales recalculados para planilla origen')

    // 8️⃣ Recalcular totales planilla DESTINO
    const totalesDestino = await sql`
      SELECT 
        COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total ELSE 0 END), 0) as total_entregado,
        COALESCE(SUM(CASE WHEN estado = 'fiado' THEN total ELSE 0 END), 0) as total_fiado,
        COALESCE(SUM(CASE WHEN estado = 'repaso' THEN total ELSE 0 END), 0) as total_repaso,
        COALESCE(SUM(CASE WHEN estado = 'devolucion' THEN total ELSE 0 END), 0) as total_devolucion,
        COALESCE(SUM(total), 0) as total_cargue
      FROM pedidos
      WHERE planilla_id = ${nuevaPlanillaId}
    `

    await sql`
      UPDATE planillas
      SET 
        total_cargue = ${totalesDestino[0].total_cargue},
        total_entregado = ${totalesDestino[0].total_entregado},
        total_fiado = ${totalesDestino[0].total_fiado},
        total_repaso = ${totalesDestino[0].total_repaso},
        total_devolucion = ${totalesDestino[0].total_devolucion},
        updated_at = NOW()
      WHERE id = ${nuevaPlanillaId}
    `

    console.log('[API Reasignar Pedido] ✓ Totales recalculados para planilla destino')

    await sql`COMMIT`

    return NextResponse.json({
      success: true,
      mensaje: `Pedido movido exitosamente de ${pedido.ruta_actual} a ${planilla.tipo_ruta}`,
      pedido: {
        id: pedidoId,
        cliente: pedido.cliente,
        estadoAnterior: pedido.estado,
        estadoNuevo: nuevoEstado,
        planillaAnterior: pedido.planilla_actual,
        planillaNueva: nuevaPlanillaId,
        rutaAnterior: pedido.ruta_actual,
        rutaNueva: planilla.tipo_ruta
      }
    })

    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

  } catch (error) {
    console.error('[API Reasignar Pedido] ERROR:', error)
    return NextResponse.json(
      { 
        error: 'Error al reasignar pedido',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
