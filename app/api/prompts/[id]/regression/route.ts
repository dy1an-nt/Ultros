import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { createDatasetRun, fanOutDatasetRun } from "@/lib/datasets/runner"
import { extractTemplateVariables, validateMapping } from "@/lib/datasets/estimate"
import { validateThreshold } from "@/lib/regression/compare"

// Launch a regression run: the new version × the baseline's dataset, rubric
// and model (pinned — regression compares prompts, not models). The verdict
// is written by the finalize hook when the run completes; poll the DatasetRun
// for progress, read the RegressionRun via the history endpoint.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const limited = await checkRateLimit("launch", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null || prompt.userId !== user.id) {
    return Response.json({ data: null, error: "Not found" }, { status: 404 })
  }

  const baseline = await prisma.baseline.findUnique({ where: { promptId: id } })
  if (!baseline) {
    return Response.json(
      { data: null, error: "no baseline set for this prompt — set a baseline first" },
      { status: 404 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const { newVersionId } = body
  if (typeof newVersionId !== "string" || !newVersionId) {
    return Response.json({ data: null, error: "newVersionId is required" }, { status: 400 })
  }
  const version = await prisma.promptVersion.findUnique({ where: { id: newVersionId } })
  if (!version || version.promptId !== prompt.id) {
    return Response.json({ data: null, error: "invalid newVersionId" }, { status: 400 })
  }

  const { threshold, error: thresholdError } = validateThreshold(body.threshold)
  if (threshold === null) {
    return Response.json({ data: null, error: thresholdError }, { status: 400 })
  }

  // The new run must be scorable, or there is nothing to compare.
  const rubric = await prisma.rubric.findUnique({ where: { id: baseline.rubricId } })
  if (!rubric || rubric.userId !== user.id) {
    return Response.json(
      { data: null, error: "the baseline's rubric no longer exists — set a new baseline" },
      { status: 400 }
    )
  }

  const baselineRun = await prisma.datasetRun.findUnique({ where: { id: baseline.datasetRunId } })
  const dataset = await prisma.dataset.findUnique({ where: { id: baseline.datasetId } })
  if (!baselineRun || !dataset) {
    // Restrict on DatasetRun→Dataset makes this unreachable in practice.
    return Response.json(
      { data: null, error: "the baseline's run or dataset no longer exists — set a new baseline" },
      { status: 400 }
    )
  }

  // Start from the baseline run's mapping for vars the new version kept,
  // identity-fill any new vars that match a column.
  const templateVars = extractTemplateVariables(version.systemPrompt, version.userPrompt)
  const baselineMapping = baselineRun.variableMapping as Record<string, string>
  const variableMapping = Object.fromEntries(
    templateVars
      .map((v) => [v, baselineMapping[v] ?? v] as const)
      .filter(([, column]) => dataset.columns.includes(column))
  )
  const mappingError = validateMapping(templateVars, variableMapping, dataset.columns)
  if (mappingError) return Response.json({ data: null, error: mappingError }, { status: 400 })

  const run = await createDatasetRun({
    userId: user.id,
    datasetId: dataset.id,
    promptVersionId: version.id,
    rubricId: rubric.id,
    model: baselineRun.model,
    temperature: baselineRun.temperature,
    maxTokens: baselineRun.maxTokens,
    variableMapping,
    totalRows: dataset.rowCount,
  })
  // Persist the regression intent before any row job can finish — the
  // finalize hook looks this row up by datasetRunId.
  const regressionRun = await prisma.regressionRun.create({
    data: {
      baselineId: baseline.id,
      userId: user.id,
      newVersionId: version.id,
      datasetRunId: run.id,
      status: "pending",
      threshold,
      regressedRowIds: [],
    },
  })
  await fanOutDatasetRun(run, dataset.rowCount)

  return Response.json(
    {
      data: {
        datasetRunId: run.id,
        regressionRunId: regressionRun.id,
        baselineScore: baseline.baselineScore,
      },
      error: null,
    },
    { status: 202 }
  )
}
