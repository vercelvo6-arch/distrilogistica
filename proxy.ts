import { NextResponse, type NextRequest } from "next/server"
import { getSession } from "@/lib/session"

export async function proxy(request: NextRequest) {
  const session = await getSession()

  // Redirect to login if not authenticated and trying to access protected routes
  if (!session && !request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // Redirect to home if authenticated and trying to access auth pages
  if (session && request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
