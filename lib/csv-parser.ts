import type { SalesRecord, Product, Order, OrderItem, RouteSheet } from "./types"

export function parseNurturingCSV(csvText: string): SalesRecord[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  const records: SalesRecord[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(";").map((v) => v.trim())

    if (values.length < 14) continue

    const cantidadStr = values[5] || "0"
    const cantidad = Number.parseInt(cantidadStr.replace(/[^\d]/g, "")) || 0

    const precioStr = values[6] || "0"
    // Remove $, spaces, dots (thousands separator), then replace comma with dot for decimals
    const precio =
      Number.parseFloat(precioStr.replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0

    const record: SalesRecord = {
      numeroArticulo: values[0] || "",
      nombreProducto: values[2] || "", // Nombre is in column 2
      cantidadComprada: cantidad,
      totalesUnidad: precio,
      ruta: values[10] || "",
      vendidoPor: values[12] || "",
      vendidoA: values[13] || "",
      fecha: values[9] || new Date().toISOString().split("T")[0],
      comentarios: values[15] || "",
    }

    if (record.numeroArticulo && record.cantidadComprada > 0) {
      records.push(record)
    }
  }

  console.log("[v0] Parsed NURTURING records:", records.length)
  console.log("[v0] Sample record:", records[0])
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

  console.log("[v0] Parsed PLANILLA products:", products.length)
  return products
}

export function generateOrdersFromSales(sales: SalesRecord[], productCatalog: Product[], fecha: string): Order[] {
  const productMap = new Map(productCatalog.map((p) => [p.codigo, p]))
  const ordersByClienteRuta = new Map<string, SalesRecord[]>()

  sales.forEach((sale) => {
    const key = `${sale.ruta}-${sale.vendidoA}`
    if (!ordersByClienteRuta.has(key)) {
      ordersByClienteRuta.set(key, [])
    }
    ordersByClienteRuta.get(key)!.push(sale)
  })

  const orders: Order[] = []

  ordersByClienteRuta.forEach((clienteSales, key) => {
    const items: OrderItem[] = clienteSales.map((sale) => {
      const product = productMap.get(sale.numeroArticulo)

      return {
        codigo: sale.numeroArticulo,
        descripcion: product?.descripcion || sale.nombreProducto,
        categoria: product?.categoria || "",
        cantidad: sale.cantidadComprada,
        valorUnidad: sale.totalesUnidad / sale.cantidadComprada, // Calculate unit price from total
        subtotal: sale.totalesUnidad, // Use the total from NURTURING column 6 directly
      }
    })

    const total = items.reduce((sum, item) => sum + item.subtotal, 0)

    orders.push({
      id: `order-${key}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      cliente: clienteSales[0].vendidoA,
      ruta: clienteSales[0].ruta,
      fecha,
      items,
      total,
      estado: "pendiente",
      comentarios: clienteSales[0].comentarios,
      montoPagado: 0,
      saldoPendiente: total,
    })
  })

  console.log("[v0] Generated orders:", orders.length)
  console.log("[v0] Sample order:", orders[0])
  return orders
}

export function generateRouteSheets(orders: Order[]): RouteSheet[] {
  const routeMap = new Map<string, Order[]>()

  orders.forEach((order) => {
    if (!routeMap.has(order.ruta)) {
      routeMap.set(order.ruta, [])
    }
    routeMap.get(order.ruta)!.push(order)
  })

  const sheets: RouteSheet[] = []

  routeMap.forEach((routeOrders, ruta) => {
    const totalAmount = routeOrders.reduce((sum, order) => sum + order.total, 0)

    sheets.push({
      id: `route-${ruta}-${Date.now()}`,
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

  console.log("[v0] Generated route sheets:", sheets.length)
  return sheets.sort((a, b) => a.ruta.localeCompare(b.ruta))
}
