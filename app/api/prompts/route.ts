import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import type { PrismaClient } from "@/app/generated/prisma/client"
import { errorResponse, jsonOk } from "@/lib/api/errors"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const prompts = await prisma.prompt.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { versions: true, runs: true } } },
  })

  return jsonOk(prompts)
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }
  const { title, description, tags, systemPrompt, userPrompt } = body as {
    title?: string
    description?: string | null
    tags?: string[]
    systemPrompt?: string
    userPrompt?: string
  }

  if (!title?.trim()) return errorResponse("VALIDATION_ERROR", "title is required")
  if (!userPrompt?.trim()) return errorResponse("VALIDATION_ERROR", "userPrompt is required")

  const prompt = await prisma.$transaction(async (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => {
    const p = await tx.prompt.create({
      data: {
        userId: user.id,
        title: title.trim(),
        description: description ?? null,
        tags: tags ?? [],
      },
    })
    await tx.promptVersion.create({
      data: {
        promptId: p.id,
        versionNumber: 1,
        systemPrompt: systemPrompt ?? "",
        userPrompt,
      },
    })
    return tx.prompt.findUnique({
      where: { id: p.id },
      include: { versions: { select: { id: true, versionNumber: true } } },
    })
  })

  return jsonOk(prompt, 201)
}
