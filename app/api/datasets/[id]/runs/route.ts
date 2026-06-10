import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const dataset = await prisma.dataset.findUnique({ where: { id } })
  if (!dataset) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (dataset.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const runs = await prisma.datasetRun.findMany({
    where: { datasetId: id },
    orderBy: { createdAt: "desc" },
  })
  return Response.json({ data: runs, error: null })
}
