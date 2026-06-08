import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (prompt.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const runs = await prisma.promptRun.findMany({
    where: { promptId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      promptVersion: { select: { versionNumber: true, label: true } },
    },
  })

  return Response.json({ data: runs, error: null })
}
