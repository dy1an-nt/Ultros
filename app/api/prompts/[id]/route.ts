import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { errorResponse, jsonOk } from "@/lib/api/errors"

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
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const { prompt, error } = await getPromptForUser(id, user.id)
  if (error === "not_found") return errorResponse("NOT_FOUND")
  if (error === "forbidden") return errorResponse("FORBIDDEN")

  return jsonOk(prompt)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const existing = await prisma.prompt.findUnique({ where: { id } })
  if (!existing || existing.deletedAt !== null) {
    return errorResponse("NOT_FOUND")
  }
  if (existing.userId !== user.id) return errorResponse("FORBIDDEN")

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }
  const { title, description, tags } = body

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return errorResponse("VALIDATION_ERROR", "title must be a non-empty string")
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return errorResponse("VALIDATION_ERROR", "description must be a string")
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))) {
    return errorResponse("VALIDATION_ERROR", "tags must be an array of strings")
  }

  const updated = await prisma.prompt.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description }),
      ...(tags !== undefined && { tags }),
    },
  })

  return jsonOk(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const existing = await prisma.prompt.findUnique({ where: { id } })
  if (!existing || existing.deletedAt !== null) {
    return errorResponse("NOT_FOUND")
  }
  if (existing.userId !== user.id) return errorResponse("FORBIDDEN")

  // Soft delete: runs/evals keep their history for usage accounting; the
  // prompt just disappears from every list and lookup (deletedAt filters).
  await prisma.prompt.update({ where: { id }, data: { deletedAt: new Date() } })

  return jsonOk({ id })
}
