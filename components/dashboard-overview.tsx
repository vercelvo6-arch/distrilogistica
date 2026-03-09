"use client"

import { useState, useEffect, useCallback } from "react"
import { formatCOP } from "@/lib/format-utils"
import {
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Truck,
  Banknote,
  RotateCcw,
  ChevronRight,
  Circle,
  ArrowUpRight,
  Package,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DaySnapshot {
  label: string
  cargueTotal: number
  cuadradoEnCaja: number
  faltaPorCuadrar: number
  fiados: number
  repasos: number
  devoluciones: number
  agotados: number
  planillasTotal: number
  planillasCuadradas: number
  planillasEnRuta: number
  cobrosIncluidos: number
}

interface EntregadorStatus {
  nombre: string
  planillas: number
  cargue: number
  cuadrado: boolean
  tieneRepasos: boolean
  tieneFiados: boolean
  diferencia?: number
}

interface RepasoItem {
  pedidoId: string
  cliente: string
  total: number
  rutaOrigen: string
  entregador: string
}

interface FiadoItem {
  id: number
  cliente: string
  saldoPendiente: number
  fechaFiado: string
  entregador: string
}

interface MananaSnapshot {
  planillasGeneradas: number
  cargueProyectado: number
  repasosPendientesReasignar: number
  montoRepasosPendientes: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

function StatusDot({ ok, warn }: { ok?: boolean; warn?: boolean }) {
  const color = ok ? "#22c55e" : warn ? "#f59e0b" : "#ef4444"
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 6px ${color}`,
        flexShrink: 0,
      }}
    />
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  sub,
  accent,
  icon: Icon,
  pulse,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  icon?: any
  pulse?: boolean
}) {
  return (
    <div
      style={{
        background: "#0f1117",
        border: "1px solid #1e2330",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: accent,
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={14} color="#4b5563" />}
        <span style={{ fontSize: 11, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "monospace" }}>
          {label}
        </span>
        {pulse && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              animation: "pulse 2s infinite",
              marginLeft: "auto",
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280" }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children, badge }: { children: React.ReactNode; badge?: string | number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9ca3af", fontFamily: "monospace" }}>
        {children}
      </span>
      {badge !== undefined && (
        <span
          style={{
            fontSize: 10,
            background: "#1e2330",
            color: "#6b7280",
            padding: "2px 8px",
            borderRadius: 99,
            fontFamily: "monospace",
          }}
        >
          {badge}
        </span>
      )}
      <div style={{ flex: 1, height: 1, background: "#1e2330" }} />
    </div>
  )
}

function ProgressBar({ value, total, color = "#3b82f6" }: { value: number; total: number; color?: string }) {
  const p = pct(value, total)
  return (
    <div style={{ width: "100%", height: 4, background: "#1e2330", borderRadius: 99, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${p}%`,
          background: color,
          borderRadius: 99,
          transition: "width 0.8s ease",
        }}
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardOverview() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const [ayer, setAyer] = useState<DaySnapshot | null>(null)
  const [hoy, setHoy] = useState<DaySnapshot | null>(null)
  const [manana, setManana] = useState<MananaSnapshot | null>(null)
  const [entregadores, setEntregadores] = useState<EntregadorStatus[]>([])
  const [repasosPendientes, setRepasosPendientes] = useState<RepasoItem[]>([])
  const [fiadosPendientes, setFiadosPendientes] = useState<FiadoItem[]>([])

  const buildSnapshot = useCallback((planillas: any[], label: string): DaySnapshot => {
    const cargueTotal = planillas.reduce((s, p) => s + Number(p.total_cargue || 0), 0)
    const cuadradas = planillas.filter((p) => p.cuadrado_en_caja)
    const cuadradoEnCaja = cuadradas.reduce((s, p) => s + Number(p.total_cargue || 0), 0)
    const enRuta = planillas.filter((p) => p.estado === "en_ruta" || p.estado === "alistado")

    let fiados = 0, repasos = 0, devoluciones = 0, agotados = 0, cobrosIncluidos = 0

    planillas.forEach((p) => {
      ;(p.pedidos || []).forEach((ped: any) => {
        const total = Number(ped.total || 0)
        if (ped.es_cobro) cobrosIncluidos += total
        if (ped.estado === "fiado") fiados += total - Number(ped.monto_pagado || 0)
        if (ped.estado === "repaso") repasos += total
        if (ped.estado === "devolucion") devoluciones += total
        ;(ped.productos || []).forEach((pr: any) => {
          if (pr.estado_producto === "agotado") agotados += Number(pr.total || 0)
        })
      })
    })

    return {
      label,
      cargueTotal,
      cuadradoEnCaja,
      faltaPorCuadrar: cargueTotal - cuadradoEnCaja,
      fiados,
      repasos,
      devoluciones,
      agotados,
      planillasTotal: planillas.length,
      planillasCuadradas: cuadradas.length,
      planillasEnRuta: enRuta.length,
      cobrosIncluidos,
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      // Fetch all planillas with their pedidos
      const res = await fetch("/api/planillas?include=pedidos,productos", {
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) throw new Error("Error al cargar planillas")
      const data = await res.json()
      const all: any[] = data.planillas || []

      const todayStr = new Date().toISOString().split("T")[0]
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0]
      const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0]

      const planHoy = all.filter((p) => p.fecha?.startsWith(todayStr))
      const planAyer = all.filter((p) => p.fecha?.startsWith(yesterdayStr))
      const planManana = all.filter((p) => p.fecha?.startsWith(tomorrowStr))

      setHoy(buildSnapshot(planHoy, "Hoy"))
      setAyer(buildSnapshot(planAyer, "Ayer"))

      // Mañana snapshot
      const repasosPend = all
        .filter((p) => p.fecha?.startsWith(todayStr) || p.fecha?.startsWith(yesterdayStr))
        .flatMap((p) =>
          (p.pedidos || [])
            .filter((ped: any) => ped.estado === "repaso")
            .map((ped: any) => ({
              pedidoId: ped.id,
              cliente: ped.cliente,
              total: Number(ped.total || 0),
              rutaOrigen: p.tipo_ruta,
              entregador: p.entregador || "—",
            }))
        )

      setRepasosPendientes(repasosPend)

      setManana({
        planillasGeneradas: planManana.length,
        cargueProyectado: planManana.reduce((s, p) => s + Number(p.total_cargue || 0), 0),
        repasosPendientesReasignar: repasosPend.length,
        montoRepasosPendientes: repasosPend.reduce((s, r) => s + r.total, 0),
      })

      // Entregadores de hoy
      const entMap: Record<string, EntregadorStatus> = {}
      planHoy.forEach((p) => {
        const nombre = p.entregador || "Sin asignar"
        if (!entMap[nombre]) {
          entMap[nombre] = { nombre, planillas: 0, cargue: 0, cuadrado: true, tieneRepasos: false, tieneFiados: false }
        }
        entMap[nombre].planillas++
        entMap[nombre].cargue += Number(p.total_cargue || 0)
        if (!p.cuadrado_en_caja) entMap[nombre].cuadrado = false
        ;(p.pedidos || []).forEach((ped: any) => {
          if (ped.estado === "repaso") entMap[nombre].tieneRepasos = true
          if (ped.estado === "fiado") entMap[nombre].tieneFiados = true
        })
      })
      setEntregadores(Object.values(entMap))

      // Fiados pendientes
      try {
        const fRes = await fetch("/api/fiados?estado=pendiente,pagado_parcial")
        if (fRes.ok) {
          const fData = await fRes.json()
          setFiadosPendientes((fData.fiados || []).slice(0, 8))
        }
      } catch {
        // fiados endpoint may not exist yet
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.error("Dashboard error:", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [buildSnapshot])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000) // auto-refresh cada minuto
    return () => clearInterval(interval)
  }, [loadData])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          color: "#4b5563",
          fontFamily: "monospace",
        }}
      >
        <div style={{ fontSize: 13, letterSpacing: "0.1em" }}>CARGANDO CENTRO DE COMANDO...</div>
        <div style={{ width: 120, height: 2, background: "#1e2330", borderRadius: 99, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: "40%",
              background: "#3b82f6",
              borderRadius: 99,
              animation: "loading 1.2s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    )
  }

  const totalFiadosPendientes = fiadosPendientes.reduce((s, f) => s + Number(f.saldo_pendiente || 0), 0)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes loading { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .cmd-row { animation: fadeUp 0.4s ease both; }
        .cmd-row:nth-child(1){animation-delay:0.05s}
        .cmd-row:nth-child(2){animation-delay:0.1s}
        .cmd-row:nth-child(3){animation-delay:0.15s}
        .cmd-row:nth-child(4){animation-delay:0.2s}
        .cmd-row:nth-child(5){animation-delay:0.25s}
        .ent-card:hover { border-color: #2d3748 !important; transform: translateY(-1px); transition: all 0.15s ease; }
        .repaso-row:hover { background: #0f1117 !important; }
      `}</style>

      <div style={{ fontFamily: "'Syne', sans-serif", color: "#f1f5f9" }}>

        {/* ── Header bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#f8fafc" }}>
              Centro de Comando
            </div>
            <div style={{ fontSize: 12, color: "#4b5563", fontFamily: "monospace", marginTop: 2 }}>
              Actualizado{" "}
              {lastUpdate.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#0f1117",
              border: "1px solid #1e2330",
              borderRadius: 8,
              padding: "8px 14px",
              color: "#6b7280",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "monospace",
              letterSpacing: "0.06em",
              transition: "all 0.15s",
            }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? "loading 1s linear infinite" : "none" }} />
            ACTUALIZAR
          </button>
        </div>

        {/* ══════════════════════════════════════════════
            BLOQUE 1 — AYER (cierre)
        ══════════════════════════════════════════════ */}
        <div className="cmd-row" style={{ marginBottom: 32 }}>
          <SectionTitle badge={ayer?.planillasTotal}>¿CÓMO CERRÓ AYER?</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <StatBlock
              label="Cargue total"
              value={formatCOP(ayer?.cargueTotal || 0)}
              sub={`${ayer?.planillasTotal || 0} planillas`}
              accent="#6366f1"
              icon={Truck}
            />
            <StatBlock
              label="Cuadrado en caja"
              value={formatCOP(ayer?.cuadradoEnCaja || 0)}
              sub={`${ayer?.planillasCuadradas || 0} / ${ayer?.planillasTotal || 0} planillas`}
              accent="#22c55e"
              icon={CheckCircle2}
            />
            <StatBlock
              label="Fiados generados"
              value={formatCOP(ayer?.fiados || 0)}
              accent="#f59e0b"
              icon={Banknote}
            />
            <StatBlock
              label="Repasos"
              value={formatCOP(ayer?.repasos || 0)}
              accent="#f97316"
              icon={RotateCcw}
            />
            <StatBlock
              label="Devoluciones"
              value={formatCOP(ayer?.devoluciones || 0)}
              accent="#ef4444"
              icon={Package}
            />
          </div>
          {ayer && ayer.planillasTotal > 0 && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <ProgressBar
                value={ayer.cuadradoEnCaja}
                total={ayer.cargueTotal}
                color={pct(ayer.cuadradoEnCaja, ayer.cargueTotal) >= 90 ? "#22c55e" : "#f59e0b"}
              />
              <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {pct(ayer.cuadradoEnCaja, ayer.cargueTotal)}% cuadrado
              </span>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            BLOQUE 2 — HOY (en vivo)
        ══════════════════════════════════════════════ */}
        <div className="cmd-row" style={{ marginBottom: 32 }}>
          <SectionTitle badge={hoy?.planillasTotal}>HOY EN LA CALLE</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <StatBlock
              label="Cargue en calle"
              value={formatCOP(hoy?.cargueTotal || 0)}
              sub={hoy?.cobrosIncluidos ? `+ ${formatCOP(hoy.cobrosIncluidos)} cobros fiados` : undefined}
              accent="#3b82f6"
              icon={Truck}
              pulse
            />
            <StatBlock
              label="Ya cuadró"
              value={formatCOP(hoy?.cuadradoEnCaja || 0)}
              sub={`${hoy?.planillasCuadradas || 0} planillas`}
              accent="#22c55e"
              icon={CheckCircle2}
            />
            <StatBlock
              label="Falta por cuadrar"
              value={formatCOP(hoy?.faltaPorCuadrar || 0)}
              sub={`${(hoy?.planillasTotal || 0) - (hoy?.planillasCuadradas || 0)} planillas en ruta`}
              accent={hoy?.faltaPorCuadrar ? "#f59e0b" : "#22c55e"}
              icon={Clock}
            />
            <StatBlock
              label="Fiados hoy"
              value={formatCOP(hoy?.fiados || 0)}
              accent="#f59e0b"
              icon={Banknote}
            />
            <StatBlock
              label="Repasos hoy"
              value={formatCOP(hoy?.repasos || 0)}
              accent="#f97316"
              icon={RotateCcw}
            />
          </div>
          {hoy && hoy.planillasTotal > 0 && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <ProgressBar
                value={hoy.cuadradoEnCaja}
                total={hoy.cargueTotal}
                color="#3b82f6"
              />
              <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {pct(hoy.cuadradoEnCaja, hoy.cargueTotal)}% cuadrado
              </span>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            BLOQUE 3 — ENTREGADORES HOY
        ══════════════════════════════════════════════ */}
        {entregadores.length > 0 && (
          <div className="cmd-row" style={{ marginBottom: 32 }}>
            <SectionTitle badge={entregadores.length}>ESTADO POR ENTREGADOR — HOY</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {entregadores.map((e) => (
                <div
                  key={e.nombre}
                  className="ent-card"
                  style={{
                    background: "#0f1117",
                    border: "1px solid #1e2330",
                    borderRadius: 10,
                    padding: "14px 18px",
                    cursor: "default",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{e.nombre}</span>
                    <StatusDot ok={e.cuadrado} warn={!e.cuadrado && e.planillas > 0} />
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>
                    <span>{e.planillas} rutas</span>
                    <span style={{ color: "#3b82f6", fontWeight: 600 }}>{formatCOP(e.cargue)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {e.cuadrado && (
                      <span style={{ fontSize: 10, background: "#052e16", color: "#22c55e", padding: "2px 7px", borderRadius: 99, fontFamily: "monospace" }}>
                        CUADRADO
                      </span>
                    )}
                    {!e.cuadrado && (
                      <span style={{ fontSize: 10, background: "#1c1917", color: "#f59e0b", padding: "2px 7px", borderRadius: 99, fontFamily: "monospace" }}>
                        EN RUTA
                      </span>
                    )}
                    {e.tieneRepasos && (
                      <span style={{ fontSize: 10, background: "#1c0a00", color: "#f97316", padding: "2px 7px", borderRadius: 99, fontFamily: "monospace" }}>
                        REPASOS
                      </span>
                    )}
                    {e.tieneFiados && (
                      <span style={{ fontSize: 10, background: "#1c1400", color: "#f59e0b", padding: "2px 7px", borderRadius: 99, fontFamily: "monospace" }}>
                        FIADOS
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            BLOQUE 4 — REPASOS PENDIENTES
        ══════════════════════════════════════════════ */}
        {repasosPendientes.length > 0 && (
          <div className="cmd-row" style={{ marginBottom: 32 }}>
            <SectionTitle badge={repasosPendientes.length}>
              <AlertTriangle size={11} style={{ marginRight: 4, color: "#f97316" }} />
              REPASOS SIN REASIGNAR
            </SectionTitle>
            <div
              style={{
                background: "#0f1117",
                border: "1px solid #1e2330",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px 80px",
                  padding: "8px 16px",
                  borderBottom: "1px solid #1e2330",
                  fontSize: 10,
                  color: "#374151",
                  fontFamily: "monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span>Cliente</span>
                <span>Ruta origen</span>
                <span>Entregador</span>
                <span style={{ textAlign: "right" }}>Total</span>
              </div>
              {repasosPendientes.slice(0, 6).map((r, i) => (
                <div
                  key={r.pedidoId}
                  className="repaso-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 120px 80px",
                    padding: "11px 16px",
                    borderBottom: i < Math.min(repasosPendientes.length, 6) - 1 ? "1px solid #1e2330" : "none",
                    alignItems: "center",
                    cursor: "default",
                  }}
                >
                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>{r.cliente}</span>
                  <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>Ruta {r.rutaOrigen}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{r.entregador}</span>
                  <span style={{ fontSize: 13, color: "#f97316", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                    {formatCOP(r.total)}
                  </span>
                </div>
              ))}
              {repasosPendientes.length > 6 && (
                <div
                  style={{
                    padding: "10px 16px",
                    fontSize: 12,
                    color: "#4b5563",
                    fontFamily: "monospace",
                    borderTop: "1px solid #1e2330",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <ChevronRight size={12} />
                  {repasosPendientes.length - 6} más — ir a pestaña Repasos
                </div>
              )}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 20, fontSize: 12, fontFamily: "monospace", color: "#6b7280" }}>
              <span>
                Total sin reasignar:{" "}
                <span style={{ color: "#f97316", fontWeight: 600 }}>
                  {formatCOP(repasosPendientes.reduce((s, r) => s + r.total, 0))}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            BLOQUE 5 — FIADOS PENDIENTES (C×C)
        ══════════════════════════════════════════════ */}
        {fiadosPendientes.length > 0 && (
          <div className="cmd-row" style={{ marginBottom: 32 }}>
            <SectionTitle badge={fiadosPendientes.length}>
              <Banknote size={11} style={{ marginRight: 4, color: "#f59e0b" }} />
              CUENTAS POR COBRAR
            </SectionTitle>
            <div
              style={{
                background: "#0f1117",
                border: "1px solid #1e2330",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px",
                  padding: "8px 16px",
                  borderBottom: "1px solid #1e2330",
                  fontSize: 10,
                  color: "#374151",
                  fontFamily: "monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span>Cliente</span>
                <span>Entregador</span>
                <span style={{ textAlign: "right" }}>Saldo</span>
              </div>
              {fiadosPendientes.map((f, i) => (
                <div
                  key={f.id}
                  className="repaso-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 120px",
                    padding: "11px 16px",
                    borderBottom: i < fiadosPendientes.length - 1 ? "1px solid #1e2330" : "none",
                    alignItems: "center",
                    cursor: "default",
                  }}
                >
                  <span style={{ fontSize: 13, color: "#cbd5e1" }}>{f.cliente}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{f.entregador || "—"}</span>
                  <span style={{ fontSize: 13, color: "#f59e0b", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                    {formatCOP(Number(f.saldo_pendiente || 0))}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 20, fontSize: 12, fontFamily: "monospace", color: "#6b7280" }}>
              <span>
                Total cartera:{" "}
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>{formatCOP(totalFiadosPendientes)}</span>
              </span>
              <span style={{ color: "#374151" }}>→ gestionar en pestaña Fiados</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            BLOQUE 6 — MAÑANA
        ══════════════════════════════════════════════ */}
        <div className="cmd-row" style={{ marginBottom: 16 }}>
          <SectionTitle>¿QUÉ SALE MAÑANA?</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <StatBlock
              label="Planillas generadas"
              value={String(manana?.planillasGeneradas || 0)}
              sub="para mañana"
              accent="#8b5cf6"
              icon={TrendingUp}
            />
            <StatBlock
              label="Cargue proyectado"
              value={formatCOP(manana?.cargueProyectado || 0)}
              accent="#8b5cf6"
              icon={ArrowUpRight}
            />
            <StatBlock
              label="Repasos por reasignar"
              value={String(manana?.repasosPendientesReasignar || 0)}
              sub={manana?.montoRepasosPendientes ? formatCOP(manana.montoRepasosPendientes) : "sin valor"}
              accent={manana?.repasosPendientesReasignar ? "#f97316" : "#22c55e"}
              icon={RotateCcw}
            />
          </div>
          {(manana?.repasosPendientesReasignar || 0) > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 16px",
                background: "#0f1117",
                border: "1px solid #291a0a",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "#f97316",
                fontFamily: "monospace",
              }}
            >
              <AlertTriangle size={13} />
              Hay {manana?.repasosPendientesReasignar} repaso(s) sin reasignar a planillas futuras. Gestionar en pestaña{" "}
              <strong>Repasos</strong>.
            </div>
          )}
        </div>

      </div>
    </>
  )
}
