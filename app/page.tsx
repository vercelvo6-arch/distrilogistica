import { MainApp } from "@/components/main-app"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"

export default async function Page() {
  const session = await getSession()

  if (!session) {
    redirect("/auth/login")
  }

  if (session.user.estado !== "activo") {
    redirect("/auth/login")
  }

  return <MainApp user={session.user} />
}
