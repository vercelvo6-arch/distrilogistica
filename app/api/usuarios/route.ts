import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import bcrypt from "bcryptjs"

// GET - Listar todos los usuarios
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin puede ver todos los usuarios
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()
    const usuarios = await sql`
      SELECT 
        id, 
        nombre, 
        email, 
        rol, 
        estado, 
        created_at, 
        updated_at 
      FROM usuarios 
      ORDER BY created_at DESC
    `
    
    return NextResponse.json({ usuarios })
  } catch (error: any) {
    console.error("[API usuarios] Error getting users:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Crear nuevo usuario
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin puede crear usuarios
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { nombre, email, password, rol, estado } = body

    console.log("[API usuarios] Request body:", { nombre, email, rol, estado })

    // Validaciones
    if (!nombre || !email || !password || !rol) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: nombre, email, password, rol" }, 
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" }, 
        { status: 400 }
      )
    }

    const sql = getDB()
    
    // Verificar si el email ya existe
    const existing = await sql`
      SELECT id FROM usuarios WHERE email = ${email}
    `
    
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "El email ya está registrado" }, 
        { status: 400 }
      )
    }

    // Generar ID único tipo TEXT
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const userId = `USR${timestamp}${random}`

    console.log("[API usuarios] Generated userId:", userId)

    // Hash de la contraseña con bcrypt
    const passwordHash = await bcrypt.hash(password, 10)

    console.log("[API usuarios] Creating user:", { userId, nombre, email, rol })

    // ✅ INICIO DE TRANSACCIÓN PROFESIONAL
    try {
      // 1. Insertar usuario
      const result = await sql`
        INSERT INTO usuarios (
          id,
          nombre, 
          email, 
          password_hash, 
          rol, 
          estado,
          created_at,
          updated_at
        )
        VALUES (
          ${userId},
          ${nombre}, 
          ${email}, 
          ${passwordHash}, 
          ${rol}, 
          ${estado || 'activo'},
          NOW(),
          NOW()
        )
        RETURNING id, nombre, email, rol, estado
      `

      console.log("[API usuarios] ✅ User created successfully:", result[0].id)

      // 2. ✅ SI ES ENTREGADOR → Crear configuración de comisiones automáticamente
      if (rol === 'entregador') {
        console.log("[API usuarios] 📦 Creating commission config for delivery person:", nombre)

        // Generar ID para comision_config
        const configId = `CFG${timestamp}${random}`
        const porcentajeDefault = 10.00 // Porcentaje por defecto

        try {
          const configResult = await sql`
            INSERT INTO comisiones_config (
              id,
              entregador,
              porcentaje_comision,
              activo,
              created_at,
              updated_at
            )
            VALUES (
              ${configId},
              ${nombre},
              ${porcentajeDefault},
              true,
              NOW(),
              NOW()
            )
            RETURNING id, entregador, porcentaje_comision
          `

          console.log("[API usuarios] ✅ Commission config created:", configResult[0])
        } catch (configError: any) {
          console.error("[API usuarios] ⚠️ Error creating commission config:", configError)
          // No fallar la creación del usuario si falla la config de comisiones
          // El admin puede crearla manualmente después
        }
      }

      return NextResponse.json({ 
        success: true, 
        usuario: result[0],
        message: rol === 'entregador' 
          ? `Usuario creado exitosamente con configuración de comisiones (${10}% por defecto)`
          : 'Usuario creado exitosamente'
      })
    } catch (insertError: any) {
      console.error("[API usuarios] ❌ Error in transaction:", insertError)
      throw insertError
    }

  } catch (error: any) {
    console.error("[API usuarios] Error creating user:", error)
    return NextResponse.json(
      { error: "Error al crear usuario: " + error.message }, 
      { status: 500 }
    )
  }
}

// PATCH - Actualizar usuario
export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin puede actualizar usuarios
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, updates } = body

    if (!userId || !updates) {
      return NextResponse.json(
        { error: "Faltan campos: userId, updates" }, 
        { status: 400 }
      )
    }

    const sql = getDB()

    // Si se actualiza la contraseña, hashearla
    if (updates.password) {
      updates.password_hash = await bcrypt.hash(updates.password, 10)
      delete updates.password
    }

    // Agregar updated_at
    updates.updated_at = new Date().toISOString()

    console.log("[API usuarios] Updating user:", userId, updates)

    // Construir query dinámicamente para los campos que vienen
    const setFields = Object.keys(updates)
      .filter(key => updates[key] !== undefined)
      .map(key => `${key} = $${key}`)

    if (setFields.length === 0) {
      return NextResponse.json(
        { error: "No hay campos para actualizar" }, 
        { status: 400 }
      )
    }

    // Actualizar usando sql template (id es TEXT)
    const result = await sql`
      UPDATE usuarios 
      SET ${sql(updates)}
      WHERE id = ${userId}
      RETURNING id, nombre, email, rol, estado
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Usuario no encontrado" }, 
        { status: 404 }
      )
    }

    console.log("[API usuarios] User updated successfully")

    // ✅ SI SE CAMBIÓ EL NOMBRE DE UN ENTREGADOR → Actualizar en comisiones_config
    if (updates.nombre && result[0].rol === 'entregador') {
      const oldName = await sql`
        SELECT nombre FROM usuarios WHERE id = ${userId}
      `

      if (oldName.length > 0 && oldName[0].nombre !== updates.nombre) {
        try {
          await sql`
            UPDATE comisiones_config
            SET entregador = ${updates.nombre}, updated_at = NOW()
            WHERE entregador = ${oldName[0].nombre}
          `
          console.log("[API usuarios] ✅ Commission config updated with new name")
        } catch (configError) {
          console.error("[API usuarios] ⚠️ Error updating commission config name:", configError)
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      usuario: result[0] 
    })
  } catch (error: any) {
    console.error("[API usuarios] Error updating user:", error)
    return NextResponse.json(
      { error: "Error al actualizar usuario: " + error.message }, 
      { status: 500 }
    )
  }
}

// DELETE - Eliminar usuario
export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin puede eliminar usuarios
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: "Falta userId" }, 
        { status: 400 }
      )
    }

    const sql = getDB()

    console.log("[API usuarios] Deleting user:", userId)

    // Obtener info del usuario antes de eliminar
    const userInfo = await sql`
      SELECT nombre, rol FROM usuarios WHERE id = ${userId}
    `

    if (userInfo.length === 0) {
      return NextResponse.json(
        { error: "Usuario no encontrado" }, 
        { status: 404 }
      )
    }

    // ✅ SI ES ENTREGADOR → Marcar su configuración como inactiva (no eliminar, por historial)
    if (userInfo[0].rol === 'entregador') {
      try {
        await sql`
          UPDATE comisiones_config
          SET activo = false, updated_at = NOW()
          WHERE entregador = ${userInfo[0].nombre}
        `
        console.log("[API usuarios] ✅ Commission config deactivated")
      } catch (configError) {
        console.error("[API usuarios] ⚠️ Error deactivating commission config:", configError)
      }
    }

    // Eliminar usuario
    const result = await sql`
      DELETE FROM usuarios 
      WHERE id = ${userId}
      RETURNING id
    `

    console.log("[API usuarios] User deleted successfully")

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[API usuarios] Error deleting user:", error)
    return NextResponse.json(
      { error: "Error al eliminar usuario: " + error.message }, 
      { status: 500 }
    )
  }
}
