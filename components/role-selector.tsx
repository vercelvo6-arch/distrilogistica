"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { User, Package, Truck, DollarSign, BarChart3 } from "lucide-react"
import type { UserRole } from "@/lib/types"

interface RoleSelectorProps {
  onSelectRole: (role: UserRole, name?: string) => void
}

export function RoleSelector({ onSelectRole }: RoleSelectorProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [deliveryName, setDeliveryName] = useState<string>("")

  const roles = [
    {
      id: "coordinador" as UserRole,
      title: "Coordinador Logístico",
      description: "Carga diaria de datos y generación de planillas por ruta",
      icon: User,
      color: "from-blue-500 to-blue-600",
    },
    {
      id: "alistador" as UserRole,
      title: "Alistador de Bodega",
      description: "Revisión y preparación de pedidos por ruta y cliente",
      icon: Package,
      color: "from-purple-500 to-purple-600",
    },
    {
      id: "entregador" as UserRole,
      title: "Entregador",
      description: "Gestión de entregas y actualización de estados",
      icon: Truck,
      color: "from-green-500 to-green-600",
    },
    {
      id: "caja" as UserRole,
      title: "Caja",
      description: "Cuadre de cuentas y recepción de efectivo",
      icon: DollarSign,
      color: "from-orange-500 to-orange-600",
    },
    {
      id: "administrador" as UserRole,
      title: "Administrador Maestro",
      description: "Informes, análisis y reportes avanzados por períodos",
      icon: BarChart3,
      color: "from-red-500 to-red-600",
    },
  ]

  const deliveryPersons = ["Alfonso", "Miguel", "Carlos", "Mateo"]

  const handleRoleSelect = (role: UserRole) => {
    if (role === "entregador") {
      setSelectedRole(role)
    } else {
      onSelectRole(role)
    }
  }

  const handleDeliverySelect = (name: string) => {
    setDeliveryName(name)
    onSelectRole("entregador", name)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Sistema de Gestión Logística</h1>
          <p className="text-muted-foreground">Seleccione su rol para continuar</p>
        </div>

        {selectedRole === "entregador" ? (
          <div className="space-y-4">
            <Button variant="outline" onClick={() => setSelectedRole(null)} className="mb-4">
              ← Volver
            </Button>
            <div className="grid gap-4 md:grid-cols-2">
              {deliveryPersons.map((person) => (
                <Card
                  key={person}
                  className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary"
                  onClick={() => handleDeliverySelect(person)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                      <Truck className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{person}</h3>
                      <p className="text-sm text-muted-foreground">Entregador</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((role) => {
              const Icon = role.icon
              return (
                <Card
                  key={role.id}
                  className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary"
                  onClick={() => handleRoleSelect(role.id)}
                >
                  <div className="flex flex-col gap-4">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${role.color}`}
                    >
                      <Icon className="h-7 w-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{role.title}</h3>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
