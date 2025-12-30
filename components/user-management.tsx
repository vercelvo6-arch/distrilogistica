"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CheckCircle2, XCircle, UserCheck, UserX, Users, UserPlus, Trash2 } from "lucide-react"
import type { User, UserRole } from "@/lib/types"

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [filter, setFilter] = useState<"todos" | "pendiente" | "activo" | "inactivo">("todos")
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  // Estado del formulario
  const [newUser, setNewUser] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "" as UserRole | "",
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const response = await fetch("/api/usuarios")
      const data = await response.json()

      if (response.ok) {
        setUsers(data.usuarios)
      }
    } catch (error) {
      console.error("Error loading users:", error)
    }
  }

  const createUser = async () => {
    if (!newUser.nombre || !newUser.email || !newUser.password || !newUser.rol) {
      alert("Por favor complete todos los campos")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: newUser.nombre,
          email: newUser.email,
          password: newUser.password,
          rol: newUser.rol,
          estado: "activo"
        }),
      })

      const data = await response.json()

      if (response.ok) {
        alert("Usuario creado exitosamente")
        setIsDialogOpen(false)
        setNewUser({ nombre: "", email: "", password: "", rol: "" })
        await loadUsers()
      } else {
        alert(data.error || "Error al crear usuario")
      }
    } catch (error) {
      console.error("Error creating user:", error)
      alert("Error al crear usuario")
    } finally {
      setIsLoading(false)
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm("¿Está seguro de eliminar este usuario?")) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        await loadUsers()
      } else {
        alert("Error al eliminar usuario")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      alert("Error al eliminar usuario")
    } finally {
      setIsLoading(false)
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

  const activeCount = users.filter((u) => u.estado === "activo").length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acción Rápida</CardTitle>
            <UserPlus className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Crear Usuario
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                  <DialogDescription>
                    Complete los datos del nuevo usuario del sistema
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="nombre">Nombre Completo</Label>
                    <Input
                      id="nombre"
                      value={newUser.nombre}
                      onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                      placeholder="Juan Pérez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="juan@distrisanty.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Contraseña segura"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rol">Cargo/Rol</Label>
                    <Select value={newUser.rol} onValueChange={(v: UserRole) => setNewUser({ ...newUser, rol: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cargo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="administrador">Administrador</SelectItem>
                        <SelectItem value="coordinador">Coordinador Logístico</SelectItem>
                        <SelectItem value="alistador">Alistador</SelectItem>
                        <SelectItem value="entregador">Entregador</SelectItem>
                        <SelectItem value="caja">Caja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createUser} disabled={isLoading} className="w-full">
                    {isLoading ? "Creando..." : "Crear Usuario"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Gestión de Usuarios</CardTitle>
              <CardDescription>Administrar usuarios del sistema</CardDescription>
            </div>
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
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
                onDeactivate={handleDeactivate}
                onActivate={handleActivate}
                onDelete={deleteUser}
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
  onDeactivate: (userId: string) => void
  onActivate: (userId: string) => void
  onDelete: (userId: string) => void
  isLoading: boolean
}

function UserCard({ user, onDeactivate, onActivate, onDelete, isLoading }: UserCardProps) {
  const getEstadoBadge = () => {
    switch (user.estado) {
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
    return labels[rol] || rol
  }

  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return "No disponible"
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString("es-CO", { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    } catch {
      return "Fecha inválida"
    }
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
                <span className="font-medium">Fecha registro:</span> {formatDate(user.created_at)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {user.estado === "activo" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDeactivate(user.id)}
                disabled={isLoading}
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
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Activar
              </Button>
            )}

            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(user.id)}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
