import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const evaluation = await prisma.evaluation.findUnique({ where: { id } })
  if (!evaluation) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (evaluation.userId !== user.id) {
    return Response.json({ data: null, error: "Forbidden" }, { status: 403 })
  }

  return Response.json({ data: evaluation, error: null })
}
