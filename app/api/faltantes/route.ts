import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';
import { repartirAlistamiento, repartirSubsanacion, resumirPorPlanilla, type EstadoAlistamiento } from "@/lib/alistamiento-reparto";
import { esNotaDelSistema } from "@/lib/sumar-notas";

// POST - Registrar faltante
//
// El alistador marca un producto UNA vez para toda su tarjeta (todas las planillas del entregador).
// Con `planillaIds` (las planillas de la tarjeta, en el orden en que se ven) el total se reparte
// línea por línea y cada planilla guarda su propio estado y su propio faltante
// (lib/alistamiento-reparto.ts). Sin `planillaIds` se reparte dentro de `planilla_id`.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const body = await request.json();
    console.log('[FALTANTES] Guardando:', body);
    const {
      planilla_id,
      planillaIds,
      codigo,
      descripcion,
      categoria,
      entregador,
      ruta,
      cantidadSolicitada,
      cantidadDisponible,
      cantidadFaltante,
      unidadIncompleta,
      observaciones,
      marcadoPor,
      estadoAlistamiento,
      productoReemplazo
    } = body;

    const sql = getDB();

    // El producto que se entregó en reemplazo antes se perdía (llegaba pero no se guardaba).
    // Se anota al inicio de las observaciones para que el inventario sepa qué salió realmente.
    // Si el alistador vuelve a editar, el texto ya trae el prefijo: se quita para no duplicarlo.
    const observacionesSinPrefijo = String(observaciones || '').replace(/^REEMPLAZO POR: [^|]*\|?\s*/, '').trim();
    const observacionesGuardar =
      estadoAlistamiento === 'reemplazo' && productoReemplazo
        ? `REEMPLAZO POR: ${String(productoReemplazo).trim().replace(/\|/g, '/')}${observacionesSinPrefijo ? ' | ' + observacionesSinPrefijo : ''}`
        : observaciones;

    const estadoFinal: EstadoAlistamiento = estadoAlistamiento ||
      (cantidadDisponible === 0 || cantidadDisponible === null ? 'no_alistado' :
       (unidadIncompleta || cantidadDisponible < cantidadSolicitada ? 'incompleto' : 'completo'));

    console.log('[FALTANTES] Estado final:', estadoFinal);

    const ids: string[] = Array.from(new Set(
      (Array.isArray(planillaIds) && planillaIds.length > 0 ? planillaIds : [planilla_id])
        .filter((id: any) => id !== null && id !== undefined && id !== '')
        .map((id: any) => String(id))
    ));

    if (ids.length === 0 || !codigo) {
      return NextResponse.json({ error: 'Faltan datos: planilla y código' }, { status: 400 });
    }

    // Líneas con mercancía por alistar de este producto en esas planillas (mismas que ve el alistador:
    // pedidos 'pendiente', la mercancía es de COALESCE(planilla_mercancia_id, planilla_id)).
    const lineasDB = await sql`
      SELECT pp.id::text AS id,
             pp.cantidad,
             COALESCE(p.planilla_mercancia_id, p.planilla_id)::text AS planilla_id
      FROM pedido_productos pp
      JOIN pedidos p ON pp.pedido_id = p.id
      WHERE COALESCE(p.planilla_mercancia_id, p.planilla_id)::text = ANY(${ids}::text[])
        AND pp.codigo = ${codigo}
        AND p.estado = 'pendiente'
      ORDER BY array_position(${ids}::text[], COALESCE(p.planilla_mercancia_id, p.planilla_id)::text),
               p.secuencia NULLS LAST, pp.id
    `;

    const planillasDB = await sql`
      SELECT id::text AS id, tipo_ruta, entregador FROM planillas WHERE id::text = ANY(${ids}::text[])
    `;
    const infoPlanilla = new Map<string, any>(planillasDB.map((p: any) => [p.id, p]));

    // Sin líneas (p. ej. el pedido ya no está pendiente): se guarda como antes, en una sola planilla.
    if (lineasDB.length === 0) {
      if (estadoFinal !== 'completo') {
        await sql`
          INSERT INTO faltantes (
            planilla_id, entregador, ruta, codigo, descripcion, categoria,
            cantidad_solicitada, cantidad_disponible, cantidad_faltante, unidad_incompleta,
            observaciones, marcado_por, estado, fecha_marcado
          ) VALUES (
            ${ids[0]}, ${entregador}, ${ruta}, ${codigo}, ${descripcion}, ${categoria || ''},
            ${cantidadSolicitada}, ${cantidadDisponible}, ${cantidadFaltante}, ${unidadIncompleta || false},
            ${observacionesGuardar || ''}, ${marcadoPor}, 'pendiente', NOW()
          )
          ON CONFLICT (planilla_id, codigo)
          DO UPDATE SET
            cantidad_disponible = ${cantidadDisponible},
            cantidad_faltante = ${cantidadFaltante},
            unidad_incompleta = ${unidadIncompleta || false},
            observaciones = ${observacionesGuardar || ''},
            fecha_marcado = NOW()
        `;
      } else {
        await sql`DELETE FROM faltantes WHERE planilla_id = ${ids[0]} AND codigo = ${codigo} AND estado = 'pendiente'`;
      }
      return NextResponse.json({ success: true, estado: estadoFinal, productosActualizados: 0, lineas: [] });
    }

    const disponibleTotal = estadoFinal === 'completo'
      ? Number.MAX_SAFE_INTEGER
      : Number(cantidadDisponible) || 0;

    const lineas = repartirAlistamiento(
      lineasDB.map((l: any) => ({ id: l.id, planillaId: l.planilla_id, cantidad: Number(l.cantidad) || 0 })),
      disponibleTotal,
      estadoFinal,
    );
    const porPlanilla = resumirPorPlanilla(lineas);
    const obsLinea = (estado: EstadoAlistamiento) => (estado === 'completo' ? null : (observacionesGuardar || null));

    // Todo en una sola transacción: o queda guardado en todas las planillas, o en ninguna.
    const consultas: any[] = [];
    for (const r of porPlanilla) {
      const info = infoPlanilla.get(r.planillaId);
      if (r.estado === 'completo') {
        consultas.push(sql`
          DELETE FROM faltantes
          WHERE planilla_id = ${r.planillaId} AND codigo = ${codigo} AND estado = 'pendiente'
        `);
      } else {
        consultas.push(sql`
          INSERT INTO faltantes (
            planilla_id, entregador, ruta, codigo, descripcion, categoria,
            cantidad_solicitada, cantidad_disponible, cantidad_faltante, unidad_incompleta,
            observaciones, marcado_por, estado, fecha_marcado
          ) VALUES (
            ${r.planillaId}, ${info?.entregador ?? entregador}, ${info?.tipo_ruta ?? ruta}, ${codigo},
            ${descripcion}, ${categoria || ''},
            ${r.solicitada}, ${r.disponible}, ${r.faltante}, ${r.unidadIncompleta},
            ${observacionesGuardar || ''}, ${marcadoPor}, 'pendiente', NOW()
          )
          ON CONFLICT (planilla_id, codigo)
          DO UPDATE SET
            cantidad_solicitada = ${r.solicitada},
            cantidad_disponible = ${r.disponible},
            cantidad_faltante = ${r.faltante},
            unidad_incompleta = ${r.unidadIncompleta},
            observaciones = ${observacionesGuardar || ''},
            fecha_marcado = NOW()
        `);
      }
    }

    consultas.push(sql`
      UPDATE pedido_productos pp
      SET estado_alistamiento = v.estado,
          cantidad_disponible = v.disponible,
          cantidad_faltante = v.faltante,
          unidad_incompleta = v.unidad_incompleta,
          observaciones_faltante = v.obs
      FROM unnest(
        ${lineas.map((l) => l.id)}::text[],
        ${lineas.map((l) => l.estado)}::text[],
        ${lineas.map((l) => l.disponible)}::numeric[],
        ${lineas.map((l) => l.faltante)}::numeric[],
        ${lineas.map((l) => l.unidadIncompleta)}::boolean[],
        ${lineas.map((l) => obsLinea(l.estado))}::text[]
      ) AS v(id, estado, disponible, faltante, unidad_incompleta, obs)
      WHERE pp.id::text = v.id
    `);

    await sql.transaction(consultas);

    console.log('[FALTANTES] ✓ Repartido en', porPlanilla.length, 'planilla(s) y', lineas.length, 'línea(s)');

    return NextResponse.json({
      success: true,
      estado: estadoFinal,
      productosActualizados: lineas.length,
      planillas: porPlanilla,
      lineas: lineas.map((l) => ({
        id: l.id,
        planillaId: l.planillaId,
        estadoAlistamiento: l.estado,
        cantidadDisponible: l.disponible,
        cantidadFaltante: l.faltante,
        unidadIncompleta: l.unidadIncompleta,
        observacionesFaltante: obsLinea(l.estado),
      })),
    });
  } catch (error) {
    console.error('[FALTANTES] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    );
  }
}

// GET - Ver faltantes (SOLO PENDIENTES por defecto)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const planilla_id = searchParams.get('planilla_id');
    const entregador = searchParams.get('entregador');
    const estado = searchParams.get('estado');
    const codigo = searchParams.get('codigo');
    const fecha_inicio = searchParams.get('fecha_inicio');
    const fecha_fin = searchParams.get('fecha_fin');
    
    console.log('[FALTANTES GET] Params:', { planilla_id, entregador, estado, codigo, fecha_inicio, fecha_fin });
    
    const sql = getDB();
    
    // Si se especifica estado concreto, filtrar por ese. Si no, traer todos (pendiente + resuelto + definitivo)
    // para que el coordinador pueda determinar qué botón mostrar (Revertir vs Reportar error)
    const estadoFiltro = estado && estado !== 'all' ? estado : null;

    let faltantes = await sql`
      SELECT 
        f.*,
        u.nombre as marcado_por_nombre,
        u2.nombre as resuelto_por_nombre,
        pl.fecha as planilla_fecha
      FROM faltantes f
      LEFT JOIN usuarios u ON f.marcado_por = u.id
      LEFT JOIN usuarios u2 ON f.resuelto_por = u2.id
      LEFT JOIN planillas pl ON f.planilla_id = pl.id
      WHERE 
        (${estadoFiltro ? sql`f.estado = ${estadoFiltro}` : sql`1=1`})
        AND (${planilla_id ? sql`f.planilla_id = ${planilla_id}` : sql`1=1`})
        AND (${entregador && entregador !== 'all' ? sql`f.entregador = ${entregador}` : sql`1=1`})
        AND (${codigo ? sql`f.codigo ILIKE ${`%${codigo}%`}` : sql`1=1`})
        AND (${fecha_inicio ? sql`f.fecha_marcado >= ${fecha_inicio}::date` : estadoFiltro === 'pendiente' ? sql`1=1` : sql`f.fecha_marcado >= CURRENT_DATE - INTERVAL '7 days'`})
        AND (${fecha_fin ? sql`f.fecha_marcado <= ${fecha_fin}::date + interval '1 day'` : sql`1=1`})
      ORDER BY f.fecha_marcado DESC 
      LIMIT ${estadoFiltro === 'pendiente' ? 3000 : 500}
    `;
    
    console.log('[FALTANTES GET] ✅ Encontrados:', faltantes.length);
    
    return NextResponse.json({ 
      success: true,
      faltantes
    });
  } catch (error) {
    console.error('[FALTANTES GET] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al obtener faltantes' },
      { status: 500 }
    );
  }
}

// Subsana UN faltante (una planilla) y actualiza sus líneas de producto.
async function subsanarUno(
  sql: any,
  faltante: any,
  tipoResolucion: 'completo' | 'parcial' | 'definitivo',
  cantidadResueltaFinal: number,
  observacionesFinal: string,
  userId: any,
) {
  let resultado: any;
  const textoDelSistema = esNotaDelSistema(observacionesFinal);

  if (tipoResolucion === 'parcial') {
    const cantidadPendiente = faltante.cantidad_faltante - cantidadResueltaFinal;
    resultado = await sql`
      UPDATE faltantes
      SET
        cantidad_faltante = ${cantidadPendiente},
        cantidad_disponible = ${Number(faltante.cantidad_disponible) + cantidadResueltaFinal},
        observaciones = CASE WHEN ${textoDelSistema} THEN observaciones ELSE ${observacionesFinal} END,
        fecha_subsanacion = CASE WHEN ${textoDelSistema} THEN fecha_subsanacion ELSE NOW() END
      WHERE id = ${faltante.id}
      RETURNING *
    `;
    console.log(`[FALTANTES SUBSANAR] ✓ Faltante ${faltante.id}: quedan ${cantidadPendiente} unidades pendientes`);
  } else {
    resultado = await sql`
      UPDATE faltantes
      SET
        estado = ${tipoResolucion === 'completo' ? 'resuelto' : 'definitivo'},
        tipo_resolucion = ${tipoResolucion},
        cantidad_resuelta = ${cantidadResueltaFinal},
        resuelto_por = ${userId},
        fecha_resolucion = NOW(),
        observaciones_resolucion = ${observacionesFinal},
        -- El comentario que escribe el coordinador pasa a ser el último del producto (Supervisión
        -- muestra solo ese, ver ultimoComentario en lib/sumar-notas.ts).
        observaciones = CASE WHEN ${textoDelSistema} THEN observaciones ELSE ${observacionesFinal} END,
        fecha_subsanacion = CASE WHEN ${textoDelSistema} THEN fecha_subsanacion ELSE NOW() END
      WHERE id = ${faltante.id}
      RETURNING *
    `;
    console.log(`[FALTANTES SUBSANAR] ✓ Faltante ${faltante.id} marcado como ${tipoResolucion}`);
  }

  const estadoProducto = tipoResolucion === 'definitivo' ? 'no_alistado' :
                        cantidadResueltaFinal >= faltante.cantidad_faltante ? 'completo' :
                        'incompleto';

  // Solo las líneas de esta planilla que tenían la novedad: las que el alistador dejó completas
  // se quedan como están (cada línea guarda su estado real, ver lib/alistamiento-reparto.ts).
  // El comentario de la línea es lo que se ve en Supervisión: se escribe el del coordinador (si escribió uno) y
  // Revertir no lo toca, solo cambia el estado. Si no escribió nada (texto automático) se deja el que había.
  await sql`
    UPDATE pedido_productos pp
    SET
      estado_alistamiento = ${estadoProducto},
      cantidad_disponible = CASE WHEN ${estadoProducto} = 'completo' THEN pp.cantidad ELSE pp.cantidad_disponible END,
      observaciones_faltante = CASE WHEN ${textoDelSistema} THEN pp.observaciones_faltante ELSE ${observacionesFinal} END
    FROM pedidos p
    WHERE pp.pedido_id = p.id
      AND COALESCE(p.planilla_mercancia_id, p.planilla_id) = ${faltante.planilla_id}
      AND pp.codigo = ${faltante.codigo}
      AND (COALESCE(pp.cantidad_faltante, 0) > 0
           OR COALESCE(pp.unidad_incompleta, false) = true
           OR pp.estado_alistamiento <> 'completo')
  `;

  // Datos de antes del reparto por planilla: el registro vivía en una sola planilla y las demás
  // del mismo entregador y día quedaban en 'pendiente'. Esas líneas toman el mismo estado para que
  // Supervisión ponga el producto en verde. Las líneas que ya tienen su propio estado no se tocan.
  await sql`
    UPDATE pedido_productos pp
    SET estado_alistamiento = ${estadoProducto}
    FROM pedidos p, planillas pl, planillas pl0
    WHERE pl0.id = ${faltante.planilla_id}
      AND pl.entregador = pl0.entregador
      AND pl.fecha_alistamiento IS NOT DISTINCT FROM pl0.fecha_alistamiento
      AND pl.id <> pl0.id
      AND pp.pedido_id = p.id
      AND COALESCE(p.planilla_mercancia_id, p.planilla_id) = pl.id
      AND p.estado = 'pendiente'
      AND pp.codigo = ${faltante.codigo}
      AND pp.estado_alistamiento = 'pendiente'
      AND NOT EXISTS (
        SELECT 1 FROM faltantes f2
        WHERE f2.planilla_id = pl.id AND f2.codigo = pp.codigo AND f2.estado = 'pendiente'
      )
  `;

  return resultado[0];
}

// PATCH - Subsanar faltante
// Con `faltanteIds` se subsana el producto de toda la tarjeta (un faltante por planilla): las
// unidades conseguidas se reparten en orden entre esos faltantes.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      faltanteId,
      faltanteIds,
      tipoResolucion,
      cantidadResuelta,
      observaciones_resolucion
    } = body;

    console.log('[FALTANTES PATCH] faltanteId(s) recibido(s):', faltanteIds || faltanteId);

    const lista: string[] = Array.from(new Set(
      (Array.isArray(faltanteIds) && faltanteIds.length > 0 ? faltanteIds : [faltanteId])
        .filter((id: any) => id !== null && id !== undefined && id !== '')
        .map((id: any) => String(id))
    ));

    // Validaciones
    if (lista.length === 0 || !tipoResolucion) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos: faltanteId y tipoResolucion' },
        { status: 400 }
      );
    }

    if (!['completo', 'parcial', 'definitivo'].includes(tipoResolucion)) {
      return NextResponse.json(
        { error: 'tipoResolucion debe ser: completo, parcial o definitivo' },
        { status: 400 }
      );
    }

    if (tipoResolucion === 'parcial' && (!cantidadResuelta || cantidadResuelta <= 0)) {
      return NextResponse.json(
        { error: 'Para resolución parcial debe especificar cantidadResuelta > 0' },
        { status: 400 }
      );
    }

    const observacionesFinal = observaciones_resolucion?.trim() || 'Subsanado por coordinador';

    const sql = getDB();

    const encontrados = await sql`
      SELECT * FROM faltantes WHERE id::text = ANY(${lista}::text[])
    `;

    if (encontrados.length === 0) {
      console.log('[FALTANTES PATCH] ❌ Faltante no encontrado:', lista);
      return NextResponse.json(
        { error: 'Faltante no encontrado en la base de datos' },
        { status: 404 }
      );
    }

    const enOrden = lista
      .map((id) => encontrados.find((f: any) => String(f.id) === id))
      .filter(Boolean) as any[];
    const pendientes = enOrden.filter((f) => f.estado === 'pendiente');

    if (pendientes.length === 0) {
      return NextResponse.json(
        { error: `Este faltante ya fue procesado (estado: ${enOrden[0].estado})` },
        { status: 409 }
      );
    }

    const totalFaltante = pendientes.reduce((s, f) => s + (Number(f.cantidad_faltante) || 0), 0);

    if (tipoResolucion === 'parcial' && Number(cantidadResuelta) > totalFaltante) {
      return NextResponse.json(
        { error: `No puede resolver más de lo que falta (máximo: ${totalFaltante})` },
        { status: 400 }
      );
    }

    const tocan = tipoResolucion === 'completo'
      ? pendientes.map((f) => Number(f.cantidad_faltante) || 0)
      : tipoResolucion === 'definitivo'
        ? pendientes.map(() => 0)
        : repartirSubsanacion(pendientes.map((f) => Number(f.cantidad_faltante) || 0), Number(cantidadResuelta));

    const resultados: any[] = [];
    let totalResuelto = 0;
    for (let i = 0; i < pendientes.length; i++) {
      const f = pendientes[i];
      const toca = tocan[i];
      let tipo: 'completo' | 'parcial' | 'definitivo';
      if (tipoResolucion === 'definitivo') tipo = 'definitivo';
      else if (toca >= (Number(f.cantidad_faltante) || 0)) tipo = 'completo';
      else if (toca > 0) tipo = 'parcial';
      else continue; // a este faltante no le alcanzó: sigue pendiente
      resultados.push(await subsanarUno(sql, f, tipo, toca, observacionesFinal, session.user.id));
      totalResuelto += toca;
    }

    return NextResponse.json({
      success: true,
      faltante: resultados[0],
      faltantes: resultados,
      mensaje:
        tipoResolucion === 'completo' ? `Faltante resuelto completamente (${totalResuelto} unidades)` :
        tipoResolucion === 'parcial' ? `Resueltas ${totalResuelto} unidades. Quedan ${totalFaltante - totalResuelto} pendientes` :
        'Faltante marcado como definitivo (no hay producto disponible)'
    });

  } catch (error) {
    console.error('[FALTANTES SUBSANAR] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al subsanar faltante' },
      { status: 500 }
    );
  }
}
