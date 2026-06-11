import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { validateRunParams, type ValidatedRunParams } from "@/lib/ai/validate"
import { DATASET_RUN_MAX_TOKENS } from "@/lib/datasets/runRequest"
import { extractTemplateVariables, validateMapping } from "@/lib/datasets/estimate"
import { launchExperiment, MAX_MODELS, MAX_VARIANTS } from "@/lib/experiments/runner"
import type { ExperimentListItem } from "@/types/experiment"

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

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
  return Response.json({ data, error: null })
}

export async function POST(req: NextRequest) {
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

  // Cost multiplies by cell count — launches must be deliberate, never a default.
  if (body.confirm !== true) {
    return Response.json(
      { data: null, error: "confirm: true is required — review the cost estimate first" },
      { status: 400 }
    )
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (name.length < 1 || name.length > 100) {
    return Response.json({ data: null, error: "name must be 1–100 characters" }, { status: 400 })
  }

  if (typeof body.datasetId !== "string" || !body.datasetId) {
    return Response.json({ data: null, error: "datasetId is required" }, { status: 400 })
  }
  const dataset = await prisma.dataset.findUnique({ where: { id: body.datasetId } })
  // 400 not 404/403 — does not leak whether another user's id exists.
  if (!dataset || dataset.userId !== user.id) {
    return Response.json({ data: null, error: "invalid datasetId" }, { status: 400 })
  }

  // Rubric is required: comparing variants without scores is meaningless.
  if (typeof body.rubricId !== "string" || !body.rubricId) {
    return Response.json({ data: null, error: "rubricId is required for experiments" }, { status: 400 })
  }
  const rubric = await prisma.rubric.findUnique({ where: { id: body.rubricId } })
  if (!rubric || rubric.userId !== user.id) {
    return Response.json({ data: null, error: "invalid rubricId" }, { status: 400 })
  }

  const variantVersionIds = body.variantVersionIds
  if (
    !Array.isArray(variantVersionIds) ||
    variantVersionIds.length < 1 ||
    variantVersionIds.length > MAX_VARIANTS ||
    variantVersionIds.some((v) => typeof v !== "string")
  ) {
    return Response.json(
      { data: null, error: `variantVersionIds must be 1–${MAX_VARIANTS} version ids` },
      { status: 400 }
    )
  }
  if (new Set(variantVersionIds).size !== variantVersionIds.length) {
    return Response.json({ data: null, error: "variantVersionIds contains duplicates" }, { status: 400 })
  }
  const versions = await prisma.promptVersion.findMany({
    where: { id: { in: variantVersionIds as string[] } },
    include: { prompt: { select: { id: true, userId: true } } },
  })
  if (versions.length !== variantVersionIds.length || versions.some((v) => v.prompt.userId !== user.id)) {
    return Response.json({ data: null, error: "invalid variantVersionIds" }, { status: 400 })
  }
  if (new Set(versions.map((v) => v.prompt.id)).size !== 1) {
    return Response.json(
      { data: null, error: "all variant versions must belong to the same prompt" },
      { status: 400 }
    )
  }

  const models = body.models
  if (
    !Array.isArray(models) ||
    models.length < 1 ||
    models.length > MAX_MODELS ||
    models.some((m) => typeof m !== "string")
  ) {
    return Response.json({ data: null, error: `models must be 1–${MAX_MODELS} model ids` }, { status: 400 })
  }
  if (new Set(models).size !== models.length) {
    return Response.json({ data: null, error: "models contains duplicates" }, { status: 400 })
  }
  let runParams: ValidatedRunParams | null = null
  for (const model of models as string[]) {
    const { params, error } = validateRunParams({
      model,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    })
    if (params === null) return Response.json({ data: null, error }, { status: 400 })
    runParams = params
  }
  if (runParams === null) return Response.json({ data: null, error: "models is required" }, { status: 400 })
  if (runParams.maxTokens > DATASET_RUN_MAX_TOKENS) {
    return Response.json(
      { data: null, error: `maxTokens must be at most ${DATASET_RUN_MAX_TOKENS} for dataset runs` },
      { status: 400 }
    )
  }

  // Variants of one prompt can declare different {{vars}}; each must map onto
  // the dataset's columns (identity mapping — the contract carries no mapping
  // object for experiments).
  const variableMappings: Record<string, Record<string, string>> = {}
  for (const version of versions) {
    const templateVars = extractTemplateVariables(version.systemPrompt, version.userPrompt)
    const mapping = Object.fromEntries(
      templateVars.filter((v) => dataset.columns.includes(v)).map((v) => [v, v])
    )
    const mappingError = validateMapping(templateVars, mapping, dataset.columns)
    if (mappingError) {
      return Response.json(
        { data: null, error: `version ${version.versionNumber}: ${mappingError}` },
        { status: 400 }
      )
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

  return Response.json({ data: { ...experiment, cells }, error: null }, { status: 202 })
}
