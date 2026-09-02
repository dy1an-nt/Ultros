import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { createDatasetRun, fanOutDatasetRun } from "@/lib/datasets/runner"
import { extractTemplateVariables, validateMapping } from "@/lib/datasets/estimate"
import { validateThreshold } from "@/lib/regression/compare"
import { errorResponse, jsonOk } from "@/lib/api/errors"

// Launch a regression run: the new version × the baseline's dataset, rubric
// and model (pinned, regression compares prompts, not models), the verdict
// is written by the finalize hook when the run completes; poll the DatasetRun
// for progress, read the RegressionRun via the history endpoint.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("launch", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null || prompt.userId !== user.id) {
    return errorResponse("NOT_FOUND")
  }

  const baseline = await prisma.baseline.findUnique({ where: { promptId: id } })
  if (!baseline) {
    return errorResponse("NOT_FOUND", "no baseline set for this prompt. Set a baseline first")
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }

  const { newVersionId } = body
  if (typeof newVersionId !== "string" || !newVersionId) {
    return errorResponse("VALIDATION_ERROR", "newVersionId is required")
  }
  const version = await prisma.promptVersion.findUnique({ where: { id: newVersionId } })
  if (!version || version.promptId !== prompt.id) {
    return errorResponse("VALIDATION_ERROR", "invalid newVersionId")
  }

  const { threshold, error: thresholdError } = validateThreshold(body.threshold)
  if (threshold === null) {
    return errorResponse("VALIDATION_ERROR", thresholdError)
  }

  // The new run must be scorable, or there is nothing to compare.
  const rubric = await prisma.rubric.findUnique({ where: { id: baseline.rubricId } })
  if (!rubric || rubric.userId !== user.id) {
    return errorResponse("VALIDATION_ERROR", "the baseline's rubric no longer exists. Set a new baseline")
  }

  const baselineRun = await prisma.datasetRun.findUnique({ where: { id: baseline.datasetRunId } })
  const dataset = await prisma.dataset.findUnique({ where: { id: baseline.datasetId } })
  if (!baselineRun || !dataset) {
    // Restrict on DatasetRun→Dataset makes this unreachable in practice.
    return errorResponse("VALIDATION_ERROR", "the baseline's run or dataset no longer exists. Set a new baseline")
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
  if (mappingError) return errorResponse("VALIDATION_ERROR", mappingError)

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
  // Persist the regression intent before any row job can finish, the
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

  return jsonOk(
    {
      datasetRunId: run.id,
      regressionRunId: regressionRun.id,
      baselineScore: baseline.baselineScore,
    },
    202
  )
}
