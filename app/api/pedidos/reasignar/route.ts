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
        p.planilla_mercancia_id,
        pl.tipo_ruta as ruta_actual,
        pl.entregador as entregador_actual,
        pl.estado as estado_planilla_actual
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

    // ✅ Todo lo que sigue muta datos (pedido y totales de 2 planillas).
    // Sin transacción, un error a mitad de camino deja el pedido ya movido
    // pero los totales de ambas planillas sin recalcular — el cargue le
    // queda "pegado" a la planilla origen. BEGIN/COMMIT asegura que o se
    // aplica todo, o no se aplica nada.
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

    // ✅ ¿La mercancía de este pedido ya se alistó/cargó en su planilla actual?
    // Si sí, la mercancía NO se mueve con el pedido: se queda contando en la
    // planilla donde se cargó (planilla_mercancia_id), y a la planilla destino
    // solo pasa el pedido (cliente y dinero → cuadre de caja). Así el alistador
    // y el coordinador de la planilla destino no ven mercancía que nunca se
    // cargó ahí, y la planilla origen conserva la suya tal como se alistó.
    //
    // Cuenta como ya cargada si: el pedido ya estaba resuelto (entregado,
    // fiado, devolución), si su planilla actual ya fue alistada/salió a ruta,
    // o si ya venía de una reasignación anterior (la mercancía sigue en la
    // planilla donde se cargó originalmente).
    //
    // Un pedido 'repaso' vuelve a 'pendiente' y se alista de nuevo, y un
    // pedido que aún no se ha cargado sigue su mercancía: en ambos casos el
    // alistador de la planilla destino SÍ debe alistarlo.
    const pedidoResuelto = ['entregado', 'fiado', 'devolucion'].includes(pedido.estado)
    const planillaActualYaCargada = ['alistado', 'en_ruta', 'completado'].includes(pedido.estado_planilla_actual)

    let planillaMercancia: string | null = null
    if (pedido.estado !== 'repaso' && (pedido.planilla_mercancia_id || pedidoResuelto || planillaActualYaCargada)) {
      planillaMercancia = pedido.planilla_mercancia_id || pedido.planilla_actual
    }
    // Si vuelve a la planilla donde se cargó, deja de ser una reasignación.
    if (planillaMercancia === nuevaPlanillaId) planillaMercancia = null

    // 6️⃣ Actualizar el pedido
    await sql`
      UPDATE pedidos
      SET
        planilla_id = ${nuevaPlanillaId},
        planilla_mercancia_id = ${planillaMercancia},
        secuencia = ${nuevaSecuencia},
        estado = ${nuevoEstado},
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[API Reasignar Pedido] ✓ Pedido actualizado', planillaMercancia ? `(mercancía permanece en ${planillaMercancia})` : '(mercancía sigue al pedido)')

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
