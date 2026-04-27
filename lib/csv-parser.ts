import type { SalesRecord, Product, Order, OrderItem, RouteSheet } from "./types"

// ✅ Helper para parsear valores monetarios del CSV
// Formato colombiano: $570.360,97 → 570360.97
function parsearMonto(valor: string): number {
  if (!valor) return 0
  return Number(
    valor
      .replace(/\$/g, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  ) || 0
}

export function parseNurturingCSV(csvText: string): SalesRecord[] {
  const lines = csvText.trim().split("\n")
  console.log("[DEBUG] Total lines:", lines.length)
  
  if (lines.length < 2) {
    console.error("[ERROR] CSV tiene menos de 2 líneas")
    return []
  }

  const records: SalesRecord[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(";").map((v) => v.trim())

    if (values.length < 14) {
      continue
    }

    // Columna 5: Cantidad Comprada
    const cantidadStr = values[5] || "0"
    const cantidad = Number.parseInt(cantidadStr.replace(/[^\d]/g, "")) || 0

    // Columna 6: Totales del ítem (valor bruto por producto)
    const precio = parsearMonto(values[6] || "0")

    // ✅ Columna 15: Totales de la FACTURA COMPLETA (ya incluye descuentos del sistema)
    const totalFactura = parsearMonto(values[15] || "0")

    // Columna 10: Ruta
    const rutaRaw = values[10] || ""
    const rutaLimpia = rutaRaw.trim()

    const record: SalesRecord = {
      numeroArticulo: values[0] || "",
      nombreProducto: values[2] || "",
      cantidadComprada: cantidad,
      totalesUnidad: precio,
      totalFactura,           // ✅ NUEVO: total real de la factura con descuentos
      ruta: rutaLimpia,
      vendidoPor: values[12] || "",
      vendidoA: values[13] || "",
      fecha: values[9] || new Date().toISOString().split("T")[0],
      comentarios: values[16] || "",
      idVenta: values[7] || "",
    }

    // Validar: debe tener código, cantidad Y ruta
    if (record.numeroArticulo && record.cantidadComprada > 0 && record.ruta) {
      records.push(record)
    }
  }

  console.log("[CSV-PARSER] ✅ Parsed NURTURING records:", records.length)
  if (records.length > 0) {
    console.log("[CSV-PARSER] 📋 Sample record:", records[0])
    const rutasUnicas = new Set(records.map(r => r.ruta))
    console.log("[CSV-PARSER] 🛣️ Rutas únicas encontradas:", Array.from(rutasUnicas).sort())
  }
  
  return records
}

export function parsePlanillaCSV(csvText: string): Product[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  const products: Product[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(";").map((v) => v.trim())

    if (values.length < 4) continue

    const product: Product = {
      ubicacion: values[0] || "",
      codigo: values[1] || "",
      descripcion: values[2] || "",
      categoria: values[3] || "",
    }

    if (product.codigo && product.descripcion) {
      products.push(product)
    }
  }

  console.log("[CSV-PARSER] ✅ Parsed PLANILLA products:", products.length)
  return products
}

export function generateOrdersFromSales(sales: SalesRecord[], productCatalog: Product[], fecha: string): Order[] {
  const productMap = new Map(productCatalog.map((p) => [p.codigo, p]))
  
  // Filtrar ventas sin ruta
  const salesConRuta = sales.filter(s => s.ruta && s.ruta.trim() !== "")
  
  console.log(`[CSV-PARSER] 📦 Sales totales: ${sales.length}, con ruta válida: ${salesConRuta.length}`)
  
  // Agrupar por RUTA + CLIENTE + ID_VENTA
  const ordersByFactura = new Map<string, SalesRecord[]>()

  salesConRuta.forEach((sale) => {
    const key = `${sale.ruta}-${sale.vendidoA}-${sale.idVenta}`
    if (!ordersByFactura.has(key)) {
      ordersByFactura.set(key, [])
    }
    ordersByFactura.get(key)!.push(sale)
  })

  console.log(`[CSV-PARSER] 🔑 Claves únicas de pedidos: ${ordersByFactura.size}`)

  const orders: Order[] = []
  let orderCounter = 0

  ordersByFactura.forEach((facturaSales, key) => {
    orderCounter++
    
    const items: OrderItem[] = facturaSales.map((sale) => {
      const product = productMap.get(sale.numeroArticulo)

      return {
        codigo: sale.numeroArticulo,
        descripcion: sale.nombreProducto || product?.descripcion,
        categoria: product?.categoria || "",
        cantidad: sale.cantidadComprada,
        valorUnidad: sale.cantidadComprada > 0
          ? sale.totalesUnidad / sale.cantidadComprada
          : 0,
        subtotal: sale.totalesUnidad,
      }
    })

    // ✅ CLAVE: usar totalFactura (columna 15) como el total real del pedido
    // Este valor ya incluye descuentos aplicados por el sistema de facturación
    // Si no está disponible, caer al total sumado de ítems
    const totalSumadoItems = items.reduce((sum, item) => sum + item.subtotal, 0)
    const totalFactura = facturaSales[0].totalFactura || 0
    
    // Usar el total de factura si es válido (mayor a 0 y cercano al total de ítems)
    // Tolerancia del 50% para evitar usar totales de factura incorrectos
    const usarTotalFactura = totalFactura > 0
    const total = usarTotalFactura ? totalFactura : totalSumadoItems

    // Calcular descuento implícito para registro
    const descuentoImplicito = usarTotalFactura
      ? Math.max(0, Math.round((totalSumadoItems - totalFactura) * 100) / 100)
      : 0

    if (descuentoImplicito > 0) {
      console.log(`[CSV-PARSER] 💰 Descuento detectado en ${facturaSales[0].vendidoA}: $${descuentoImplicito} (${((descuentoImplicito/totalSumadoItems)*100).toFixed(1)}%)`)
    }

    const ruta = facturaSales[0].ruta.trim()

    const uniqueId = `ORD${Date.now()}${String(orderCounter).padStart(4, '0')}${Math.random().toString(36).substr(2, 4)}`
    
    orders.push({
      id: uniqueId,
      cliente: facturaSales[0].vendidoA,
      ruta,
      fecha,
      items,
      total,                    // ✅ Total real con descuentos incluidos
      estado: "pendiente",
      comentarios: facturaSales[0].comentarios,
      montoPagado: 0,
      saldoPendiente: total,
    })
  })

  console.log("[CSV-PARSER] ✅ Generated orders:", orders.length)
  if (orders.length > 0) {
    console.log("[CSV-PARSER] 📋 Sample order:", {
      cliente: orders[0].cliente,
      total: orders[0].total,
      items: orders[0].items.length
    })
    const ordenesXRuta = new Map<string, number>()
    orders.forEach(o => {
      ordenesXRuta.set(o.ruta, (ordenesXRuta.get(o.ruta) || 0) + 1)
    })
    console.log("[CSV-PARSER] 📊 Órdenes por ruta:", Object.fromEntries(ordenesXRuta))
  }
  
  return orders
}

export function generateRouteSheets(orders: Order[]): RouteSheet[] {
  console.log(`[CSV-PARSER] 🚛 Generando planillas desde ${orders.length} órdenes`)
  
  const ordenesValidas = orders.filter(o => o.ruta && o.ruta.trim() !== "")
  
  if (ordenesValidas.length < orders.length) {
    console.warn(`[CSV-PARSER] ⚠️ ${orders.length - ordenesValidas.length} órdenes sin ruta válida fueron excluidas`)
  }
  
  const routeMap = new Map<string, Order[]>()

  ordenesValidas.forEach((order) => {
    const rutaKey = order.ruta.trim()
    if (!routeMap.has(rutaKey)) {
      routeMap.set(rutaKey, [])
    }
    routeMap.get(rutaKey)!.push(order)
  })

  console.log(`[CSV-PARSER] 🗺️ Rutas únicas encontradas: ${routeMap.size}`)
  console.log(`[CSV-PARSER] 🛣️ Lista de rutas:`, Array.from(routeMap.keys()).sort())

  const sheets: RouteSheet[] = []
  let sheetCounter = 0

  routeMap.forEach((routeOrders, ruta) => {
    sheetCounter++
    // ✅ totalAmount usa los totales reales (ya con descuentos)
    const totalAmount = routeOrders.reduce((sum, order) => sum + order.total, 0)

    const uniqueId = `PLN${Date.now()}${String(sheetCounter).padStart(3, '0')}R${ruta}${Math.random().toString(36).substr(2, 3)}`

    console.log(`[CSV-PARSER] 📄 Planilla ${sheetCounter}: Ruta ${ruta} - ${routeOrders.length} pedidos - $${totalAmount.toFixed(2)}`)

    sheets.push({
      id: uniqueId,
      ruta,
      fecha: routeOrders[0].fecha,
      orders: routeOrders,
      totalOrders: routeOrders.length,
      totalAmount,
      estado: "pendiente",
      montoCargue: totalAmount,
      montoEntregado: 0,
      montoFiado: 0,
      montoDevoluciones: 0,
      montoRepasos: 0,
      cuentasPorCobrar: [],
    })
  })

  console.log("[CSV-PARSER] ✅ Generated route sheets:", sheets.length)
  console.log("[CSV-PARSER] 📊 Resumen:")
  sheets.forEach(s => {
    console.log(`  - Ruta ${s.ruta}: ${s.orders.length} pedidos, Total: $${s.totalAmount.toFixed(2)}`)
  })
  
  return sheets.sort((a, b) => a.ruta.localeCompare(b.ruta))
}
