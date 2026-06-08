import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

async function getPromptForUser(id: string, userId: string) {
  const prompt = await prisma.prompt.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      _count: { select: { runs: true } },
    },
  })
  if (!prompt) return { prompt: null, error: "not_found" }
  if (prompt.userId !== userId) return { prompt: null, error: "forbidden" }
  return { prompt, error: null }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const { prompt, error } = await getPromptForUser(id, user.id)
  if (error === "not_found") return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (error === "forbidden") return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  return Response.json({ data: prompt, error: null })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const existing = await prisma.prompt.findUnique({ where: { id } })
  if (!existing) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (existing.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { title, description, tags } = body

  const updated = await prisma.prompt.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description }),
      ...(tags !== undefined && { tags }),
    },
  })

  return Response.json({ data: updated, error: null })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const existing = await prisma.prompt.findUnique({ where: { id } })
  if (!existing) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (existing.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  await prisma.prompt.delete({ where: { id } })

  return Response.json({ data: { id }, error: null })
}
