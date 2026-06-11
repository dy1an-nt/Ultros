import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"

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
  if (!prompt || prompt.deletedAt !== null) return { prompt: null, error: "not_found" }
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

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const existing = await prisma.prompt.findUnique({ where: { id } })
  if (!existing || existing.deletedAt !== null) {
    return Response.json({ data: null, error: "Not found" }, { status: 404 })
  }
  if (existing.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }
  const { title, description, tags } = body

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return Response.json({ data: null, error: "title must be a non-empty string" }, { status: 400 })
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return Response.json({ data: null, error: "description must be a string" }, { status: 400 })
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))) {
    return Response.json({ data: null, error: "tags must be an array of strings" }, { status: 400 })
  }

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

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const existing = await prisma.prompt.findUnique({ where: { id } })
  if (!existing || existing.deletedAt !== null) {
    return Response.json({ data: null, error: "Not found" }, { status: 404 })
  }
  if (existing.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  // Soft delete: runs/evals keep their history for usage accounting; the
  // prompt just disappears from every list and lookup (deletedAt filters).
  await prisma.prompt.update({ where: { id }, data: { deletedAt: new Date() } })

  return Response.json({ data: { id }, error: null })
}
