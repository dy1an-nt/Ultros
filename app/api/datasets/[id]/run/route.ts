import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { loadRunRequest } from "@/lib/datasets/runRequest"
import { launchDatasetRun } from "@/lib/datasets/runner"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const limited = await checkRateLimit("launch", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  // The cost gate: launches must be deliberate, never a default.
  if (body.confirm !== true) {
    return Response.json(
      { data: null, error: "confirm: true is required — review the cost estimate first" },
      { status: 400 }
    )
  }

  const loaded = await loadRunRequest(user.id, id, body)
  if (loaded.value === null) {
    return Response.json({ data: null, error: loaded.error }, { status: loaded.status })
  }
  const { dataset, version, params: runParams, variableMapping } = loaded.value

  let rubricId: string | null = null
  if (body.rubricId !== undefined && body.rubricId !== null) {
    if (typeof body.rubricId !== "string") {
      return Response.json({ data: null, error: "invalid rubricId" }, { status: 400 })
    }
    // 400 not 404/403 — does not leak whether another user's rubric id exists.
    const rubric = await prisma.rubric.findUnique({ where: { id: body.rubricId } })
    if (!rubric || rubric.userId !== user.id) {
      return Response.json({ data: null, error: "invalid rubricId" }, { status: 400 })
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

  return Response.json({ data: run, error: null }, { status: 202 })
}
