import { NextResponse, type NextRequest } from "next/server"
import { getSession } from "@/lib/session"

export async function proxy(request: NextRequest) {
  console.log("[v0] Middleware checking path:", request.nextUrl.pathname)

  if (request.nextUrl.pathname.startsWith("/api")) {
    console.log("[v0] Middleware allowing API route")
    return NextResponse.next()
  }

  const session = await getSession()
  console.log("[v0] Middleware session:", session ? "authenticated" : "not authenticated")

  // Redirect to login if not authenticated and trying to access protected routes
  if (!session && !request.nextUrl.pathname.startsWith("/auth")) {
    console.log("[v0] Redirecting to login (no session)")
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // Redirect to home if authenticated and trying to access auth pages
  if (session && request.nextUrl.pathname.startsWith("/auth")) {
    console.log("[v0] Redirecting to home (has session)")
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  console.log("[v0] Middleware allowing request")
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
