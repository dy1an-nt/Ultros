import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { loadRunRequest } from "@/lib/datasets/runRequest"
import { launchDatasetRun } from "@/lib/datasets/runner"
import { errorResponse, jsonOk } from "@/lib/api/errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("launch", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }

  // The cost gate: launches must be deliberate, never a default.
  if (body.confirm !== true) {
    return errorResponse("VALIDATION_ERROR", "confirm: true is required — review the cost estimate first")
  }

  const loaded = await loadRunRequest(user.id, id, body)
  if (loaded.value === null) {
    return errorResponse(loaded.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", loaded.error)
  }
  const { dataset, version, params: runParams, variableMapping } = loaded.value

  let rubricId: string | null = null
  if (body.rubricId !== undefined && body.rubricId !== null) {
    if (typeof body.rubricId !== "string") {
      return errorResponse("VALIDATION_ERROR", "invalid rubricId")
    }
    // 400 not 404/403 — does not leak whether another user's rubric id exists.
    const rubric = await prisma.rubric.findUnique({ where: { id: body.rubricId } })
    if (!rubric || rubric.userId !== user.id) {
      return errorResponse("VALIDATION_ERROR", "invalid rubricId")
    }
    rubricId = rubric.id
  }

  const run = await launchDatasetRun({
    userId: user.id,
    datasetId: dataset.id,
    promptVersionId: version.id,
    rubricId,
    model: runParams.model,
    temperature: runParams.temperature,
    maxTokens: runParams.maxTokens,
    variableMapping,
    totalRows: dataset.rowCount,
  })

  return jsonOk(run, 202)
}
