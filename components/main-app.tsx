"use client"

import { CoordinadorView } from "@/components/coordinador-view"
import { AlistadorView } from "@/components/alistador-view"
import { EntregadorView } from "@/components/entregador-view"
import { CajaView } from "@/components/caja-view"
import { AdministradorView } from "@/components/administrador-view"
import type { User } from "@/lib/types"

interface MainAppProps {
  user: User
}

export function MainApp({ user }: MainAppProps) {
  const handleLogout = async () => {
    try {
      // Llamar al endpoint de logout para eliminar la sesión de la BD
      await fetch('/api/logout', { 
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('[v0] Error during logout:', error)
    } finally {
      // Limpiar cookie del lado del cliente (por si acaso)
      document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax"
      
      // Redirigir al login
      window.location.href = "/auth/login"
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
