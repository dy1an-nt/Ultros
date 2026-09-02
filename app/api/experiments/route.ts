import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { validateRunParams, type ValidatedRunParams } from "@/lib/ai/validate"
import { DATASET_RUN_MAX_TOKENS } from "@/lib/datasets/runRequest"
import { extractTemplateVariables, validateMapping } from "@/lib/datasets/estimate"
import { launchExperiment, MAX_MODELS, MAX_VARIANTS } from "@/lib/experiments/runner"
import type { ExperimentListItem } from "@/types/experiment"
import { errorResponse, jsonOk } from "@/lib/api/errors"

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const experiments = await prisma.experiment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  const cells = await prisma.datasetRun.findMany({
    where: { experimentId: { in: experiments.map((e) => e.id) } },
    select: { experimentId: true, status: true },
  })

  const data: ExperimentListItem[] = experiments.map((e) => {
    const mine = cells.filter((c) => c.experimentId === e.id)
    return {
      ...e,
      status: e.status as ExperimentListItem["status"],
      createdAt: e.createdAt.toISOString(),
      completedAt: e.completedAt?.toISOString() ?? null,
      cellsTotal: e.variantVersionIds.length * e.models.length,
      cellsTerminal: mine.filter((c) => c.status === "complete" || c.status === "failed").length,
    }
  })
  return jsonOk(data)
}

export async function POST(req: NextRequest) {
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

  // Cost multiplies by cell count. Launches must be deliberate, never a default.
  if (body.confirm !== true) {
    return errorResponse("VALIDATION_ERROR", "confirm: true is required. Review the cost estimate first")
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (name.length < 1 || name.length > 100) {
    return errorResponse("VALIDATION_ERROR", "name must be 1–100 characters")
  }

  if (typeof body.datasetId !== "string" || !body.datasetId) {
    return errorResponse("VALIDATION_ERROR", "datasetId is required")
  }
  const dataset = await prisma.dataset.findUnique({ where: { id: body.datasetId } })
  // 400 not 404/403. Does not leak whether another user's id exists.
  if (!dataset || dataset.userId !== user.id) {
    return errorResponse("VALIDATION_ERROR", "invalid datasetId")
  }

  // Rubric is required: comparing variants without scores is meaningless.
  if (typeof body.rubricId !== "string" || !body.rubricId) {
    return errorResponse("VALIDATION_ERROR", "rubricId is required for experiments")
  }
  const rubric = await prisma.rubric.findUnique({ where: { id: body.rubricId } })
  if (!rubric || rubric.userId !== user.id) {
    return errorResponse("VALIDATION_ERROR", "invalid rubricId")
  }

  const variantVersionIds = body.variantVersionIds
  if (
    !Array.isArray(variantVersionIds) ||
    variantVersionIds.length < 1 ||
    variantVersionIds.length > MAX_VARIANTS ||
    variantVersionIds.some((v) => typeof v !== "string")
  ) {
    return errorResponse("VALIDATION_ERROR", `variantVersionIds must be 1–${MAX_VARIANTS} version ids`)
  }
  if (new Set(variantVersionIds).size !== variantVersionIds.length) {
    return errorResponse("VALIDATION_ERROR", "variantVersionIds contains duplicates")
  }
  const versions = await prisma.promptVersion.findMany({
    where: { id: { in: variantVersionIds as string[] } },
    include: { prompt: { select: { id: true, userId: true } } },
  })
  if (versions.length !== variantVersionIds.length || versions.some((v) => v.prompt.userId !== user.id)) {
    return errorResponse("VALIDATION_ERROR", "invalid variantVersionIds")
  }
  if (new Set(versions.map((v) => v.prompt.id)).size !== 1) {
    return errorResponse("VALIDATION_ERROR", "all variant versions must belong to the same prompt")
  }

  const models = body.models
  if (
    !Array.isArray(models) ||
    models.length < 1 ||
    models.length > MAX_MODELS ||
    models.some((m) => typeof m !== "string")
  ) {
    return errorResponse("VALIDATION_ERROR", `models must be 1–${MAX_MODELS} model ids`)
  }
  if (new Set(models).size !== models.length) {
    return errorResponse("VALIDATION_ERROR", "models contains duplicates")
  }
  let runParams: ValidatedRunParams | null = null
  for (const model of models as string[]) {
    const { params, error } = validateRunParams({
      model,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    })
    if (params === null) return errorResponse("VALIDATION_ERROR", error)
    runParams = params
  }
  if (runParams === null) return errorResponse("VALIDATION_ERROR", "models is required")
  if (runParams.maxTokens > DATASET_RUN_MAX_TOKENS) {
    return errorResponse("VALIDATION_ERROR", `maxTokens must be at most ${DATASET_RUN_MAX_TOKENS} for dataset runs`)
  }

  // Variants of one prompt can declare different {{vars}}; each must map onto
  // the dataset's columns (identity mapping. The contract carries no mapping
  // object for experiments).
  const variableMappings: Record<string, Record<string, string>> = {}
  for (const version of versions) {
    const templateVars = extractTemplateVariables(version.systemPrompt, version.userPrompt)
    const mapping = Object.fromEntries(
      templateVars.filter((v) => dataset.columns.includes(v)).map((v) => [v, v])
    )
    const mappingError = validateMapping(templateVars, mapping, dataset.columns)
    if (mappingError) {
      return errorResponse("VALIDATION_ERROR", `version ${version.versionNumber}: ${mappingError}`)
    }
    variableMappings[version.id] = mapping
  }

  const { experiment, cells } = await launchExperiment({
    userId: user.id,
    name,
    datasetId: dataset.id,
    rubricId: rubric.id,
    variantVersionIds: variantVersionIds as string[],
    models: models as string[],
    temperature: runParams.temperature,
    maxTokens: runParams.maxTokens,
    totalRows: dataset.rowCount,
    variableMappings,
  })

  return jsonOk({ ...experiment, cells }, 202)
}
