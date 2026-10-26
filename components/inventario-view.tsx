"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Boxes, Download, Loader2, Trash2, Upload } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"

const num = (v: any) => Number(v) || 0
const fmt = (v: any) => num(v).toLocaleString("es-CO", { maximumFractionDigits: 2 })

function hoyBogota(desplazar = 0): string {
  const d = new Date(Date.now() + desplazar * 86400000)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d)
}

// Los archivos del POS pueden venir en UTF-8 o en Windows-1252 (Excel): se prueba UTF-8 y, si
// falla, se lee como Windows-1252 para no dañar las tildes ni las ñ.
async function leerArchivo(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder("windows-1252").decode(buf)
  }
}

function descargarCSV(nombre: string, cabecera: string[], filas: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const texto = [cabecera, ...filas].map((f) => f.map(esc).join(";")).join("\r\n")
  const blob = new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  URL.revokeObjectURL(a.href)
}

const ETIQUETA_TIPO: Record<string, string> = {
  catalogo: "Catálogo",
  ventas: "Ventas del POS",
  inventario: "Inventario del POS",
}

export function InventarioView() {
  const { toast } = useToast()
  const [desde, setDesde] = useState(hoyBogota(-7))
  const [hasta, setHasta] = useState(hoyBogota(0))
  const [busqueda, setBusqueda] = useState("")
  const [soloDiferencias, setSoloDiferencias] = useState(true)

  const [cargas, setCargas] = useState<any[]>([])
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [fechaInventario, setFechaInventario] = useState(hoyBogota(0))
  const [catalogoResumen, setCatalogoResumen] = useState<any>(null)

  const [cruceVentas, setCruceVentas] = useState<any>(null)
  const [cruceSaldos, setCruceSaldos] = useState<any>(null)
  const [cargaSaldoId, setCargaSaldoId] = useState<number | null>(null)
  const [salidas, setSalidas] = useState<any>(null)
  const [ajustes, setAjustes] = useState<any[]>([])
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [cargandoSalidas, setCargandoSalidas] = useState(false)

  const [dialogAjuste, setDialogAjuste] = useState<{ codigo: string; nombre: string } | null>(null)
  const [ajusteCantidad, setAjusteCantidad] = useState("")
  const [ajusteMotivo, setAjusteMotivo] = useState("")
  const [guardandoAjuste, setGuardandoAjuste] = useState(false)

  async function pedir(url: string, init?: RequestInit) {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "Error en la solicitud")
    return data
  }

  const cargarCargas = useCallback(async () => {
    try {
      const [c, cat] = await Promise.all([pedir("/api/inventario/cargas"), pedir("/api/inventario/catalogo")])
      setCargas(c.cargas || [])
      setCatalogoResumen(cat.resumen || null)
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    }
  }, [toast])

  const cargarDatos = useCallback(async () => {
    setCargandoDatos(true)
    try {
      const rango = `desde=${desde}&hasta=${hasta}`
      const extra = cargaSaldoId ? `&carga_id=${cargaSaldoId}` : ""
      const [v, s, sal, aj] = await Promise.all([
        pedir(`/api/inventario/cruce-ventas?${rango}`),
        pedir(`/api/inventario/cruce-saldos?${rango}${extra}`),
        pedir(`/api/inventario/salidas?${rango}`),
        pedir(`/api/inventario/ajustes?${rango}`),
      ])
      setCruceVentas(v)
      setCruceSaldos(s)
      setSalidas(sal)
      setAjustes(aj.ajustes || [])
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setCargandoDatos(false)
    }
  }, [desde, hasta, cargaSaldoId, toast])

  useEffect(() => {
    cargarCargas()
  }, [cargarCargas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  async function subir(tipo: "catalogo" | "ventas" | "saldos", file: File | undefined) {
    if (!file) return
    setSubiendo(tipo)
    try {
      const texto = await leerArchivo(file)
      const data = await pedir(`/api/inventario/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivo: file.name, texto, ...(tipo === "saldos" ? { fecha: fechaInventario } : {}) }),
      })
      toast({ title: "Listo", description: data.mensaje || "Archivo cargado" })
      await Promise.all([cargarCargas(), cargarDatos()])
    } catch (e: any) {
      toast({ title: "No se pudo cargar el archivo", description: e.message, variant: "destructive" })
    } finally {
      setSubiendo(null)
    }
  }

  async function eliminarCarga(id: number) {
    if (!confirm("¿Deshacer esta carga? Se borran las líneas que trajo.")) return
    try {
      await pedir(`/api/inventario/cargas?id=${id}`, { method: "DELETE" })
      await Promise.all([cargarCargas(), cargarDatos()])
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    }
  }

  async function cargarSalidasPendientes() {
    setCargandoSalidas(true)
    try {
      const data = await pedir("/api/inventario/salidas", { method: "POST" })
      toast({ title: "Listo", description: data.mensaje })
      await cargarDatos()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setCargandoSalidas(false)
    }
  }

  async function guardarAjuste() {
    if (!dialogAjuste) return
    setGuardandoAjuste(true)
    try {
      await pedir("/api/inventario/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: dialogAjuste.codigo, cantidad: Number(ajusteCantidad), motivo: ajusteMotivo, fecha: hasta }),
      })
      toast({ title: "Ajuste registrado", description: `${dialogAjuste.codigo}: ${ajusteCantidad}` })
      setDialogAjuste(null)
      setAjusteCantidad("")
      setAjusteMotivo("")
      await cargarDatos()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setGuardandoAjuste(false)
    }
  }

  async function borrarAjuste(id: number) {
    if (!confirm("¿Eliminar este ajuste?")) return
    try {
      await pedir(`/api/inventario/ajustes?id=${id}`, { method: "DELETE" })
      await cargarDatos()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    }
  }

  const coincide = (f: any) => {
    const q = busqueda.trim().toLowerCase()
    return !q || String(f.codigo).toLowerCase().includes(q) || String(f.nombre || "").toLowerCase().includes(q)
  }

  const filasVentas = useMemo(
    () => (cruceVentas?.filas || []).filter((f: any) => coincide(f) && (!soloDiferencias || Math.abs(num(f.diferencia)) > 0.001)),
    [cruceVentas, busqueda, soloDiferencias] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const filasSaldos = useMemo(
    () => (cruceSaldos?.filas || []).filter((f: any) => coincide(f) && (!soloDiferencias || Math.abs(num(f.pendiente)) > 0.001)),
    [cruceSaldos, busqueda, soloDiferencias] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const dinero = cruceVentas?.devolucionesDinero
  const difDinero = dinero ? num(dinero.pos) - num(dinero.caja) : 0

  const colorDif = (n: number) => (Math.abs(n) < 0.001 ? "text-gray-500" : n > 0 ? "text-amber-700 font-semibold" : "text-red-600 font-semibold")

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Boxes className="h-5 w-5" />
          Inventario
        </h2>
        <p className="text-sm text-muted-foreground">
          Cruza lo que salió de bodega en cada planilla alistada contra las ventas, las devoluciones y el inventario del POS.
        </p>
      </div>

      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-[150px]" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">Buscar producto o código</Label>
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej: balance, 892, V99" />
        </div>
        <Button variant={soloDiferencias ? "default" : "outline"} size="sm" onClick={() => setSoloDiferencias(!soloDiferencias)}>
          {soloDiferencias ? "Solo con diferencia" : "Mostrar todo"}
        </Button>
        {cargandoDatos && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </Card>

      <Tabs defaultValue="ventas">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="ventas">Cruce de ventas</TabsTrigger>
          <TabsTrigger value="saldos">Cruce de inventario</TabsTrigger>
          <TabsTrigger value="salidas">Salidas</TabsTrigger>
          <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          <TabsTrigger value="archivos">Subir archivos</TabsTrigger>
        </TabsList>

        {/* ───────────── CRUCE DE VENTAS ───────────── */}
        <TabsContent value="ventas" className="space-y-3">
          <Card className="p-3 text-sm space-y-2">
            <p className="text-gray-600">
              Por producto: <strong>Salió</strong> (planillas alistadas) frente a lo <strong>facturado</strong> y lo
              <strong> devuelto</strong> en el POS. <strong>Diferencia = (facturado − devuelto) − salió</strong>. Positiva: el POS cobró
              más de lo que salió. Negativa: salió más de lo facturado.
            </p>
            {cruceVentas && (
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>Planillas con salida en el rango: <strong>{cruceVentas.cobertura?.planillas ?? 0}</strong></span>
                <span>Líneas de ventas del POS: <strong>{cruceVentas.cobertura?.lineas_ventas ?? 0}</strong></span>
              </div>
            )}
            {cruceVentas && (num(cruceVentas.cobertura?.planillas) === 0 || num(cruceVentas.cobertura?.lineas_ventas) === 0) && (
              <p className="text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">
                Falta {num(cruceVentas.cobertura?.planillas) === 0 ? "la salida de planillas (pestaña Salidas)" : "subir el CSV de ventas del POS (pestaña Subir archivos)"} para estas fechas.
              </p>
            )}
          </Card>

          {dinero && (
            <Card className="p-3">
              <p className="text-sm font-medium mb-2">Devoluciones en dinero</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-gray-50 rounded p-2"><span className="text-xs text-gray-500">Registradas en caja</span><p className="font-semibold">{formatCOP(num(dinero.caja))}</p></div>
                <div className="bg-gray-50 rounded p-2"><span className="text-xs text-gray-500">Devueltas en el POS</span><p className="font-semibold">{formatCOP(num(dinero.pos))}</p></div>
                <div className="bg-gray-50 rounded p-2"><span className="text-xs text-gray-500">Diferencia</span><p className={`font-semibold ${colorDif(difDinero)}`}>{formatCOP(difDinero)}</p></div>
              </div>
              <p className="text-xs text-gray-400 mt-1">Caja cuenta por fecha de cierre del cuadre; el POS, por fecha de la devolución.</p>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline" size="sm"
              disabled={filasVentas.length === 0}
              onClick={() => descargarCSV(`cruce_ventas_${desde}_${hasta}.csv`,
                ["Código", "Producto", "Salió", "Facturado POS", "Devuelto POS", "Neto POS", "Diferencia"],
                filasVentas.map((f: any) => [f.codigo, f.nombre || "", num(f.salio), num(f.facturado), num(f.devuelto), num(f.neto_pos), num(f.diferencia)]))}
            >
              <Download className="h-4 w-4 mr-1" /> Descargar
            </Button>
          </div>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead><TableHead>Producto</TableHead>
                  <TableHead className="text-right">Salió</TableHead><TableHead className="text-right">Facturado</TableHead>
                  <TableHead className="text-right">Devuelto POS</TableHead><TableHead className="text-right">Neto POS</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasVentas.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-6">Sin datos para mostrar</TableCell></TableRow>
                ) : filasVentas.slice(0, 600).map((f: any) => (
                  <TableRow key={f.codigo}>
                    <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                    <TableCell className="text-xs max-w-[320px] truncate">{f.nombre || "—"}</TableCell>
                    <TableCell className="text-right">{fmt(f.salio)}</TableCell>
                    <TableCell className="text-right">{fmt(f.facturado)}</TableCell>
                    <TableCell className="text-right">{fmt(f.devuelto)}</TableCell>
                    <TableCell className="text-right">{fmt(f.neto_pos)}</TableCell>
                    <TableCell className={`text-right ${colorDif(num(f.diferencia))}`}>{num(f.diferencia) > 0 ? "+" : ""}{fmt(f.diferencia)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ───────────── CRUCE DE INVENTARIO ───────────── */}
        <TabsContent value="saldos" className="space-y-3">
          <Card className="p-3 text-sm space-y-2">
            <p className="text-gray-600">
              El POS descuenta lo <strong>facturado</strong>, pero a la calle solo salió lo <strong>alistado</strong>. Por producto:
              <strong> ajuste sugerido en el POS = (facturado − devuelto) − salió</strong>. Positivo: hay que <strong>sumar</strong> al
              inventario del POS; negativo: <strong>restar</strong>. No incluye compras.
            </p>
            {cruceSaldos?.cargas?.length > 0 ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Inventario del POS usado:</span>
                <select
                  className="border rounded px-2 py-1 text-xs"
                  value={cruceSaldos.carga?.id || ""}
                  onChange={(e) => setCargaSaldoId(Number(e.target.value))}
                >
                  {cruceSaldos.cargas.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.periodo_hasta ? String(c.periodo_hasta).slice(0, 10) : "sin fecha"} — {c.archivo || "archivo"}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">
                Aún no has subido el inventario del POS con cantidades (pestaña Subir archivos).
              </p>
            )}
          </Card>

          <div className="flex justify-end">
            <Button
              variant="outline" size="sm"
              disabled={filasSaldos.length === 0}
              onClick={() => descargarCSV(`cruce_inventario_${desde}_${hasta}.csv`,
                ["Código", "Producto", "Saldo POS", "Facturado", "Devuelto", "Salió", "Ajuste sugerido", "Ya ajustado", "Pendiente", "Saldo real sugerido"],
                filasSaldos.map((f: any) => [f.codigo, f.nombre || "", num(f.saldo_pos), num(f.facturado), num(f.devuelto), num(f.salio), num(f.ajuste_sugerido), num(f.ajustes_aplicados), num(f.pendiente), num(f.saldo_real)]))}
            >
              <Download className="h-4 w-4 mr-1" /> Descargar
            </Button>
          </div>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead><TableHead>Producto</TableHead>
                  <TableHead className="text-right">Saldo POS</TableHead><TableHead className="text-right">Facturado − devuelto</TableHead>
                  <TableHead className="text-right">Salió</TableHead><TableHead className="text-right">Ya ajustado</TableHead>
                  <TableHead className="text-right">Ajuste pendiente</TableHead><TableHead className="text-right">Saldo real sugerido</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasSaldos.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-gray-400 py-6">Sin datos para mostrar</TableCell></TableRow>
                ) : filasSaldos.slice(0, 600).map((f: any) => (
                  <TableRow key={f.codigo}>
                    <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate">{f.nombre || "—"}</TableCell>
                    <TableCell className="text-right">{fmt(f.saldo_pos)}</TableCell>
                    <TableCell className="text-right">{fmt(num(f.facturado) - num(f.devuelto))}</TableCell>
                    <TableCell className="text-right">{fmt(f.salio)}</TableCell>
                    <TableCell className="text-right">{fmt(f.ajustes_aplicados)}</TableCell>
                    <TableCell className={`text-right ${colorDif(num(f.pendiente))}`}>{num(f.pendiente) > 0 ? "+" : ""}{fmt(f.pendiente)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(f.saldo_real)}</TableCell>
                    <TableCell>
                      {Math.abs(num(f.pendiente)) > 0.001 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => { setDialogAjuste({ codigo: f.codigo, nombre: f.nombre || f.codigo }); setAjusteCantidad(String(num(f.pendiente))); setAjusteMotivo("") }}>
                          Ajustar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ───────────── SALIDAS ───────────── */}
        <TabsContent value="salidas" className="space-y-3">
          <Card className="p-3 space-y-2 text-sm">
            <p className="text-gray-600">
              Lo que salió de bodega por producto, guardado cada vez que el alistador termina una planilla. Esta copia no se borra
              cuando caja cuadra.
            </p>
            {salidas && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-gray-50 rounded p-2"><span className="text-xs text-gray-500">Planillas</span><p className="font-semibold">{salidas.resumen?.planillas ?? 0}</p></div>
                <div className="bg-gray-50 rounded p-2"><span className="text-xs text-gray-500">Productos distintos</span><p className="font-semibold">{salidas.resumen?.productos ?? 0}</p></div>
                <div className="bg-gray-50 rounded p-2"><span className="text-xs text-gray-500">Unidades que salieron</span><p className="font-semibold">{fmt(salidas.resumen?.unidades_salieron)}</p></div>
                <div className="bg-gray-50 rounded p-2"><span className="text-xs text-gray-500">Unidades faltantes</span><p className="font-semibold">{fmt(salidas.resumen?.unidades_faltantes)}</p></div>
              </div>
            )}
            {num(salidas?.planillasSinCargar) > 0 && (
              <div className="flex flex-wrap items-center gap-3 bg-amber-50 rounded p-2">
                <span className="text-xs text-amber-800">
                  Hay <strong>{salidas.planillasSinCargar}</strong> planillas alistadas de este mes, todavía sin cuadrar, cuya salida no está guardada.
                </span>
                <Button size="sm" onClick={cargarSalidasPendientes} disabled={cargandoSalidas}>
                  {cargandoSalidas ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cargarlas ahora"}
                </Button>
              </div>
            )}
          </Card>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead><TableHead>Producto</TableHead>
                  <TableHead className="text-right">Pedido</TableHead><TableHead className="text-right">Faltante</TableHead>
                  <TableHead className="text-right">Salió</TableHead><TableHead className="text-right">Planillas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(salidas?.productos || []).filter(coincide).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-400 py-6">Sin datos para mostrar</TableCell></TableRow>
                ) : (salidas?.productos || []).filter(coincide).slice(0, 500).map((f: any) => (
                  <TableRow key={f.codigo}>
                    <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                    <TableCell className="text-xs max-w-[320px] truncate">{f.nombre || "—"}</TableCell>
                    <TableCell className="text-right">{fmt(f.pedido)}</TableCell>
                    <TableCell className="text-right">{num(f.faltante) > 0 ? <span className="text-red-600">{fmt(f.faltante)}</span> : "0"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(f.salio)}</TableCell>
                    <TableCell className="text-right">{f.planillas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ───────────── AJUSTES ───────────── */}
        <TabsContent value="ajustes" className="space-y-3">
          <Card className="p-3 text-sm text-gray-600">
            Ajustes manuales ya aplicados al inventario del POS en estas fechas. Un número positivo se suma al POS y uno negativo se resta.
            Ejemplo: facturaron 2 Balance Hombre pero salieron 1 Hombre y 1 Dama → <strong>+1 en Hombre</strong> y <strong>−1 en Dama</strong>.
            Se registran desde la pestaña “Cruce de inventario”.
          </Card>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Código</TableHead><TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead><TableHead>Motivo</TableHead><TableHead>Registró</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ajustes.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-6">No hay ajustes en estas fechas</TableCell></TableRow>
                ) : ajustes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{String(a.fecha).slice(0, 10)}</TableCell>
                    <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                    <TableCell className="text-xs max-w-[240px] truncate">{a.nombre}</TableCell>
                    <TableCell className="text-right font-semibold">{num(a.cantidad) > 0 ? "+" : ""}{fmt(a.cantidad)}</TableCell>
                    <TableCell className="text-xs">{a.motivo}</TableCell>
                    <TableCell className="text-xs text-gray-500">{a.registrado_por}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => borrarAjuste(a.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ───────────── SUBIR ARCHIVOS ───────────── */}
        <TabsContent value="archivos" className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <Card className="p-3 space-y-2">
              <p className="font-medium text-sm">1. Catálogo de productos</p>
              <p className="text-xs text-gray-500">
                El archivo de inventario/kits del POS (código, nombre, categoría, precio). Actualiza los productos que ya existen y agrega los nuevos.
                {catalogoResumen && num(catalogoResumen.total) > 0 && <> Hoy hay <strong>{catalogoResumen.total}</strong> productos ({catalogoResumen.kits} kits).</>}
              </p>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm border rounded px-3 py-2 hover:bg-gray-50">
                {subiendo === "catalogo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Elegir archivo
                <input type="file" accept=".csv,.txt" className="hidden" disabled={!!subiendo}
                  onChange={(e) => { subir("catalogo", e.target.files?.[0]); e.target.value = "" }} />
              </label>
            </Card>

            <Card className="p-3 space-y-2">
              <p className="font-medium text-sm">2. Ventas del POS</p>
              <p className="text-xs text-gray-500">
                El CSV de ventas. Si cubre fechas ya subidas, las reemplaza. Las devoluciones del POS se reconocen por cantidad o valor negativos.
              </p>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm border rounded px-3 py-2 hover:bg-gray-50">
                {subiendo === "ventas" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Elegir archivo
                <input type="file" accept=".csv,.txt" className="hidden" disabled={!!subiendo}
                  onChange={(e) => { subir("ventas", e.target.files?.[0]); e.target.value = "" }} />
              </label>
            </Card>

            <Card className="p-3 space-y-2">
              <p className="font-medium text-sm">3. Inventario del POS (con cantidades)</p>
              <p className="text-xs text-gray-500">Mismo formato del catálogo, pero con la columna de cantidad llena. Indica la fecha a la que corresponde.</p>
              <Input type="date" value={fechaInventario} onChange={(e) => setFechaInventario(e.target.value)} className="w-[150px]" />
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm border rounded px-3 py-2 hover:bg-gray-50">
                {subiendo === "saldos" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Elegir archivo
                <input type="file" accept=".csv,.txt" className="hidden" disabled={!!subiendo}
                  onChange={(e) => { subir("saldos", e.target.files?.[0]); e.target.value = "" }} />
              </label>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <div className="p-3 border-b text-sm font-medium">Archivos subidos</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead><TableHead>Archivo</TableHead><TableHead>Fechas</TableHead>
                  <TableHead className="text-right">Filas</TableHead><TableHead>Subió</TableHead><TableHead>Cuándo</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargas.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-gray-400 py-6">Todavía no se ha subido ningún archivo</TableCell></TableRow>
                ) : cargas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><Badge variant="secondary">{ETIQUETA_TIPO[c.tipo] || c.tipo}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">{c.archivo || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {c.periodo_desde ? `${String(c.periodo_desde).slice(0, 10)} → ${String(c.periodo_hasta).slice(0, 10)}`
                        : c.periodo_hasta ? String(c.periodo_hasta).slice(0, 10) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{c.filas}</TableCell>
                    <TableCell className="text-xs">{c.subido_por || "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(c.subido_en).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</TableCell>
                    <TableCell>
                      {c.tipo !== "catalogo" && (
                        <Button size="sm" variant="ghost" onClick={() => eliminarCarga(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!dialogAjuste} onOpenChange={(abierto) => { if (!abierto) setDialogAjuste(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar ajuste</DialogTitle>
            <DialogDescription>
              {dialogAjuste && <><strong>{dialogAjuste.codigo}</strong> — {dialogAjuste.nombre}. Cantidad que se SUMA al inventario del POS (negativa para restar).</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cantidad</Label>
              <Input type="number" value={ajusteCantidad} onChange={(e) => setAjusteCantidad(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Motivo</Label>
              <Input value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} placeholder="Ej: sustitución del asesor, agotado no registrado" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAjuste(null)}>Cancelar</Button>
            <Button onClick={guardarAjuste} disabled={guardandoAjuste || !ajusteCantidad || !ajusteMotivo.trim()}>
              {guardandoAjuste ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
