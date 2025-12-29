"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, XCircle, UserCheck, UserX, Users } from "lucide-react"
import type { User, UserRole } from "@/lib/types"

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [filter, setFilter] = useState<"todos" | "pendiente" | "activo" | "inactivo">("todos")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const response = await fetch("/api/usuarios")
      const data = await response.json()

      if (response.ok) {
        setUsers(data.usuarios.filter((u: User) => u.email !== "admin@empresa.com"))
      }
    } catch (error) {
      console.error("Error loading users:", error)
    }
  }

  const updateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const response = await fetch("/api/usuarios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, updates }),
      })

      const data = await response.json()

      if (response.ok) {
        await loadUsers()
        return true
      } else {
        console.error("Error updating user:", data.error)
        return false
      }
    } catch (error) {
      console.error("Error updating user:", error)
      return false
    }
  }

  const handleApprove = async (userId: string, rol: UserRole) => {
    setIsLoading(true)
    try {
      const success = await updateUser(userId, { rol, estado: "activo" })
      if (!success) {
        alert("Error al aprobar usuario")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleReject = async (userId: string) => {
    setIsLoading(true)
    try {
      const success = await updateUser(userId, { estado: "inactivo" })
      if (!success) {
        alert("Error al rechazar usuario")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeactivate = async (userId: string) => {
    setIsLoading(true)
    try {
      const success = await updateUser(userId, { estado: "inactivo" })
      if (!success) {
        alert("Error al desactivar usuario")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleActivate = async (userId: string) => {
    setIsLoading(true)
    try {
      const success = await updateUser(userId, { estado: "activo" })
      if (!success) {
        alert("Error al activar usuario")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const filteredUsers = users.filter((u) => (filter === "todos" ? true : u.estado === filter))

  const pendingCount = users.filter((u) => u.estado === "pendiente").length
  const activeCount = users.filter((u) => u.estado === "activo").length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuarios Pendientes</CardTitle>
            <Users className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Esperando aprobación</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuarios Activos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Con acceso al sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">Registrados en el sistema</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Gestión de Usuarios</CardTitle>
              <CardDescription>Aprobar, rechazar y gestionar usuarios del sistema</CardDescription>
            </div>
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="inactivo">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredUsers.length === 0 && (
              <Alert>
                <AlertDescription>No hay usuarios en esta categoría</AlertDescription>
              </Alert>
            )}

            {filteredUsers.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onApprove={handleApprove}
                onReject={handleReject}
                onDeactivate={handleDeactivate}
                onActivate={handleActivate}
                isLoading={isLoading}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface UserCardProps {
  user: User
  onApprove: (userId: string, rol: UserRole) => void
  onReject: (userId: string) => void
  onDeactivate: (userId: string) => void
  onActivate: (userId: string) => void
  isLoading: boolean
}

function UserCard({ user, onApprove, onReject, onDeactivate, onActivate, isLoading }: UserCardProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | "">(user.rol || "")

  const getEstadoBadge = () => {
    switch (user.estado) {
      case "pendiente":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            Pendiente
          </Badge>
        )
      case "activo":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Activo
          </Badge>
        )
      case "inactivo":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            Inactivo
          </Badge>
        )
    }
  }

  const getRolLabel = (rol: UserRole) => {
    const labels = {
      coordinador: "Coordinador Logístico",
      alistador: "Alistador",
      entregador: "Entregador",
      caja: "Caja",
      administrador: "Administrador",
    }
    return labels[rol]
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-lg">{user.nombre}</h3>
              {getEstadoBadge()}
              {user.rol && <Badge variant="secondary">{getRolLabel(user.rol)}</Badge>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div className="col-span-1 sm:col-span-2">
                <span className="font-medium">Email:</span> {user.email}
              </div>
              <div className="col-span-1 sm:col-span-2">
                <span className="font-medium">Fecha registro:</span>{" "}
                {new Date(user.fechaRegistro).toLocaleDateString("es-CO")}
              </div>
            </div>
          </div>

          <div className="space-y-2 w-full lg:w-auto">
            {user.estado === "pendiente" && (
              <div className="space-y-2">
                <Select value={selectedRole} onValueChange={(v: UserRole) => setSelectedRole(v)}>
                  <SelectTrigger className="w-full lg:w-[200px]">
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordinador">Coordinador Logístico</SelectItem>
                    <SelectItem value="alistador">Alistador</SelectItem>
                    <SelectItem value="entregador">Entregador</SelectItem>
                    <SelectItem value="caja">Caja</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (selectedRole) {
                        onApprove(user.id, selectedRole)
                      }
                    }}
                    disabled={!selectedRole || isLoading}
                    className="flex-1 lg:flex-none"
                  >
                    <UserCheck className="mr-2 h-4 w-4" />
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onReject(user.id)}
                    disabled={isLoading}
                    className="flex-1 lg:flex-none"
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Rechazar
                  </Button>
                </div>
              </div>
            )}

            {user.estado === "activo" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDeactivate(user.id)}
                disabled={isLoading}
                className="w-full lg:w-auto"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Desactivar
              </Button>
            )}

            {user.estado === "inactivo" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onActivate(user.id)}
                disabled={isLoading}
                className="w-full lg:w-auto"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Activar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
