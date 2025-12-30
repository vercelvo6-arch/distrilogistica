export const dynamic = 'force-dynamic'

import { MainApp } from "@/components/main-app"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"

export default async function Page() {
  console.log("[v0] Home page: Checking session")
  
  const session = await getSession()
  console.log("[v0] Home page: Session result:", session ? "found" : "not found")
  
  if (!session) {
    console.log("[v0] Home page: No session, redirecting to login")
    redirect("/auth/login")
  }
  
  console.log("[v0] Home page: User estado:", session.user.estado)
  
  if (session.user.estado !== "activo") {
    console.log("[v0] Home page: User not active, redirecting to login")
    redirect("/auth/login")
  }
  
  console.log("[v0] Home page: Rendering MainApp for user:", session.user.email)
  
  return <MainApp user={session.user} />
}
