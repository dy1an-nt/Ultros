import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { errorResponse, jsonOk } from "@/lib/api/errors"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null) return errorResponse("NOT_FOUND")
  if (prompt.userId !== user.id) return errorResponse("FORBIDDEN")

  const versions = await prisma.promptVersion.findMany({
    where: { promptId: id },
    orderBy: { versionNumber: "desc" },
  })

  return jsonOk(versions)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null) return errorResponse("NOT_FOUND")
  if (prompt.userId !== user.id) return errorResponse("FORBIDDEN")

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }
  const { systemPrompt, userPrompt, variables, label } = body as {
    systemPrompt?: string
    userPrompt?: string
    variables?: Record<string, string>
    label?: string | null
  }

  if (!userPrompt?.trim()) {
    return errorResponse("VALIDATION_ERROR", "userPrompt is required")
  }

  const latest = await prisma.promptVersion.findFirst({
    where: { promptId: id },
    orderBy: { versionNumber: "desc" },
  })
  const nextVersion = (latest?.versionNumber ?? 0) + 1

  const version = await prisma.promptVersion.create({
    data: {
      promptId: id,
      versionNumber: nextVersion,
      systemPrompt: systemPrompt ?? "",
      userPrompt,
      variables: variables ?? {},
      label: label ?? null,
    },
  })

  return jsonOk(version, 201)
}
