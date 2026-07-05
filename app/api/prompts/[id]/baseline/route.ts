import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { toBaselineDto } from "@/lib/regression/baseline"
import { errorResponse, jsonOk } from "@/lib/api/errors"

async function loadPrompt(clerkId: string, promptId: string) {
  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return { user: null, prompt: null }
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!prompt || prompt.deletedAt !== null || prompt.userId !== user.id) return { user, prompt: null }
  return { user, prompt }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const { user, prompt } = await loadPrompt(clerkId, id)
  if (!user) return errorResponse("NOT_FOUND", "User not found")
  if (!prompt) return errorResponse("NOT_FOUND")

  const baseline = await prisma.baseline.findUnique({ where: { promptId: id } })
  if (!baseline) {
    return errorResponse("NOT_FOUND", "no baseline set for this prompt")
  }
  return jsonOk(await toBaselineDto(baseline))
}

// A baseline is set by pointing at an existing complete DatasetRun of the
// version (architect pin: cheaper than launching a fresh run, and the user
// blesses numbers they have already seen).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const { user, prompt } = await loadPrompt(clerkId, id)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)
  if (!prompt) return errorResponse("NOT_FOUND")

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }

  const { promptVersionId, datasetRunId } = body
  if (typeof promptVersionId !== "string" || !promptVersionId) {
    return errorResponse("VALIDATION_ERROR", "promptVersionId is required")
  }
  if (typeof datasetRunId !== "string" || !datasetRunId) {
    return errorResponse("VALIDATION_ERROR", "datasetRunId is required")
  }

  const version = await prisma.promptVersion.findUnique({ where: { id: promptVersionId } })
  if (!version || version.promptId !== prompt.id) {
    return errorResponse("VALIDATION_ERROR", "invalid promptVersionId")
  }

  const run = await prisma.datasetRun.findUnique({ where: { id: datasetRunId } })
  if (!run || run.userId !== user.id) {
    return errorResponse("VALIDATION_ERROR", "invalid datasetRunId")
  }
  if (run.promptVersionId !== version.id) {
    return errorResponse("VALIDATION_ERROR", "datasetRunId does not belong to the given promptVersionId")
  }
  if (run.status !== "complete") {
    return errorResponse("VALIDATION_ERROR", "baseline run must be complete")
  }
  if (run.rubricId === null || run.avgScore === null || run.passRate === null) {
    return errorResponse("VALIDATION_ERROR", "baseline run must be scored against a rubric")
  }

  const data = {
    userId: user.id,
    promptVersionId: version.id,
    datasetId: run.datasetId,
    rubricId: run.rubricId,
    datasetRunId: run.id,
    baselineScore: run.avgScore,
    baselinePassRate: run.passRate,
    setAt: new Date(),
  }
  // One active baseline per prompt — re-POST replaces it (and its regression
  // history goes stale against the new anchor, so the cascade is on delete only).
  const baseline = await prisma.baseline.upsert({
    where: { promptId: prompt.id },
    create: { promptId: prompt.id, ...data },
    update: data,
  })

  return jsonOk(await toBaselineDto(baseline), 201)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const { user, prompt } = await loadPrompt(clerkId, id)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)
  if (!prompt) return errorResponse("NOT_FOUND")

  const baseline = await prisma.baseline.findUnique({ where: { promptId: id } })
  if (!baseline) {
    return errorResponse("NOT_FOUND", "no baseline set for this prompt")
  }
  // Cascade removes the regression history — it is meaningless without its anchor.
  await prisma.baseline.delete({ where: { id: baseline.id } })
  return jsonOk({ id: baseline.id })
}
