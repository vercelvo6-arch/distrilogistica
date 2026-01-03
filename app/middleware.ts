import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  console.log('[Middleware] Checking path:', pathname)

  // Rutas públicas que NO necesitan autenticación
  const publicPaths = ['/auth/login', '/auth/register']
  if (publicPaths.some(path => pathname.startsWith(path))) {
    console.log('[Middleware] Public path, allowing')
    return NextResponse.next()
  }

  // Rutas de API - permitir (tienen su propia autenticación)
  if (pathname.startsWith('/api/')) {
    console.log('[Middleware] API route, allowing')
    return NextResponse.next()
  }

  // Verificar sesión
  const session = await getSession()
  
  if (!session?.user) {
    console.log('[Middleware] No session, redirecting to login')
    const loginUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  const userRole = session.user.rol
  console.log('[Middleware] User role:', userRole, 'Path:', pathname)

  // Mapeo de rutas protegidas por rol
  const roleRoutes: Record<string, string[]> = {
    'coordinador': ['/coordinador'],
    'alistador': ['/alistador'],
    'entregador': ['/entregador'],
    'caja': ['/caja'],
    'administrador': ['/admin']
  }

  // Si está en la raíz "/", redirigir a su dashboard según rol
  if (pathname === '/') {
    const redirectMap: Record<string, string> = {
      'coordinador': '/coordinador',
      'alistador': '/alistador',
      'entregador': '/entregador',
      'caja': '/caja',
      'administrador': '/admin'
    }
    
    const redirectPath = redirectMap[userRole]
    if (redirectPath) {
      console.log('[Middleware] Redirecting from / to', redirectPath)
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
  }

  // Verificar si el usuario tiene permiso para acceder a esta ruta
  const allowedPaths = roleRoutes[userRole] || []
  const hasAccess = allowedPaths.some(path => pathname.startsWith(path))

  // Admin tiene acceso a TODO
  const isAdmin = userRole === 'administrador'

  if (!hasAccess && !isAdmin) {
    console.log('[Middleware] Access denied, redirecting to role dashboard')
    // Redirigir a su dashboard correcto
    const redirectMap: Record<string, string> = {
      'coordinador': '/coordinador',
      'alistador': '/alistador',
      'entregador': '/entregador',
      'caja': '/caja'
    }
    
    const redirectPath = redirectMap[userRole] || '/auth/login'
    return NextResponse.redirect(new URL(redirectPath, request.url))
  }

  console.log('[Middleware] Access granted')
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
