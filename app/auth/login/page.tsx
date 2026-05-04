"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { Truck, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("distrisantysas@gmail.com")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Selector de recorrido
  const [usuariosDisponibles, setUsuariosDisponibles] = useState<any[]>([])
  const [mostrarSelector, setMostrarSelector] = useState(false)

  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    console.log("[LOGIN] Iniciando sesión...")

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al iniciar sesión")
      }

      // Si hay múltiples recorridos para este usuario → mostrar selector
      if (data.requiereSeleccion) {
        setUsuariosDisponibles(data.usuariosDisponibles)
        setMostrarSelector(true)
        setIsLoading(false)
        return
      }

      // Login normal → redirigir
      window.location.href = "/"
    } catch (error: unknown) {
      console.error("[LOGIN] Error:", error)
      setError(error instanceof Error ? error.message : "Error al iniciar sesión")
      setIsLoading(false)
    }
  }

  const handleSeleccionarRecorrido = async (userId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/seleccionar-recorrido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        credentials: "include",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Error al seleccionar recorrido")
      }

      window.location.href = "/"
    } catch (error: unknown) {
      console.error("[LOGIN] Error seleccionando recorrido:", error)
      setError(error instanceof Error ? error.message : "Error al seleccionar recorrido")
      setIsLoading(false)
    }
  }

  // Formatear el email para mostrar solo el recorrido
  const formatearRecorrido = (email: string) => {
    return email
      .replace("@gmail.com", "")
      .replace("@distrisanty.com", "")
      .replace("distrisanty", "")
      .replace("alfonso", "Alfonso")
      .trim()
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-teal-50 to-green-50">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2">
              <Truck className="h-8 w-8 text-teal-600" />
              <h1 className="text-2xl font-bold text-teal-900">Distrisanty Logística</h1>
            </div>
            <p className="text-sm text-muted-foreground">Sistema de gestión de entregas</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {mostrarSelector ? "¿Qué recorrido vas a trabajar hoy?" : "Iniciar Sesión"}
              </CardTitle>
              <CardDescription>
                {mostrarSelector
                  ? "Selecciona tu recorrido del día"
                  : "Ingresa tu correo y contraseña"}
              </CardDescription>
            </CardHeader>
            <CardContent>

              {/* SELECTOR DE RECORRIDO */}
              {mostrarSelector ? (
                <div className="flex flex-col gap-3">
                  {usuariosDisponibles.map((u) => (
                    <Button
                      key={u.id}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3 px-4 border-teal-200 hover:bg-teal-50 hover:border-teal-400"
                      onClick={() => handleSeleccionarRecorrido(u.id)}
                      disabled={isLoading}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-semibold text-teal-800">
                          {formatearRecorrido(u.email)}
                        </span>
                        <span className="text-xs text-gray-400">{u.email}</span>
                      </div>
                    </Button>
                  ))}

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full text-gray-500 mt-2"
                    onClick={() => {
                      setMostrarSelector(false)
                      setUsuariosDisponibles([])
                      setError(null)
                    }}
                    disabled={isLoading}
                  >
                    ← Volver al inicio de sesión
                  </Button>
                </div>
              ) : (

              /* FORMULARIO DE LOGIN NORMAL */
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="distrisantysas@gmail.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    className="w-full bg-teal-600 hover:bg-teal-700"
                    disabled={isLoading}
                  >
                    {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm">
                  ¿No tienes cuenta?{" "}
                  <Link href="/auth/register" className="underline underline-offset-4 text-teal-600">
                    Regístrate
                  </Link>
                </div>
              </form>

              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
