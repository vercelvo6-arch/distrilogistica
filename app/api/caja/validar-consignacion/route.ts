import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo caja y admin pueden validar
    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { numeroConsignacion } = body

    if (!numeroConsignacion) {
      return NextResponse.json(
        { error: 'Número de consignación requerido' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Buscar si existe el número de consignación
    const existe = await sql`
      SELECT id, numero_consignacion, fecha_recepcion, recibido_por
      FROM recepciones_caja 
      WHERE numero_consignacion = ${numeroConsignacion}
    `

    if (existe.length > 0) {
      return NextResponse.json({
        existe: true,
        mensaje: 'Este número de consignación ya fue registrado',
        detalles: {
          fecha: existe[0].fecha_recepcion,
          recibidoPor: existe[0].recibido_por
        }
      })
    }

    return NextResponse.json({
      existe: false,
      mensaje: 'Número de consignación disponible'
    })

  } catch (error) {
    console.error('[API validar-consignacion] Error:', error)
    return NextResponse.json(
      { error: 'Error al validar consignación' },
      { status: 500 }
    )
  }
}
```

### **2.4 - Commit**
```
Commit message: feat: agregar validación de consignaciones únicas
Clic en "Commit changes"
