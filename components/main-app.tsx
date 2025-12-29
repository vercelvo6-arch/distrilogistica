"use client"

import { CoordinadorView } from "@/components/coordinador-view"
import { AlistadorView } from "@/components/alistador-view"
import { EntregadorView } from "@/components/entregador-view"
import { CajaView } from "@/components/caja-view"
import { AdministradorView } from "@/components/administrador-view"
import type { User } from "@/lib/types"
import { useRouter } from "next/navigation"

interface MainAppProps {
  user: User
}

export function MainApp({ user }: MainAppProps) {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      })
      router.push("/auth/login")
      router.refresh()
    } catch (error) {
      console.error("Error al cerrar sesión:", error)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {user.rol === "coordinador" && <CoordinadorView onLogout={handleLogout} user={user} />}
      {user.rol === "alistador" && <AlistadorView onLogout={handleLogout} user={user} />}
      {user.rol === "entregador" && <EntregadorView onLogout={handleLogout} user={user} />}
      {user.rol === "caja" && <CajaView onLogout={handleLogout} user={user} />}
      {user.rol === "administrador" && <AdministradorView onLogout={handleLogout} user={user} />}
    </div>
  )
}
