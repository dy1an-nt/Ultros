import { prisma } from "@/lib/prisma"
import type { CriterionScore } from "@/types/eval"

// The ONLY code that builds public share payloads. Allowlist-based by
// contract: copy named fields, never spread a Prisma object. Anything not
// explicitly listed here does not leave the database.

export type PublicEvalSummary = {
  totalScore: number | null
  passed: boolean | null
  aiEvalReasoning: string | null
  criteria: { name: string; score: number }[]
}

export type PublicPromptRun = {
  promptTitle: string
  versionNumber: number
  model: string
  createdAt: string
  responseText: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  finishReason: string | null
  eval: PublicEvalSummary | null
}

export type PublicBatchRow = {
  rowIndex: number
  input: Record<string, string>
  expectedOutput: string | null
  responseText: string
  score: number | null
  passed: boolean | null
}

export type PublicDatasetRun = {
  promptTitle: string
  versionNumber: number
  datasetName: string
  model: string
  createdAt: string
  totalRows: number
  completedRows: number
  failedRows: number
  avgScore: number | null
  scoreVariance: number | null
  passRate: number | null
  avgLatencyMs: number | null
  totalCostUsd: number
  rows: PublicBatchRow[]
}

export type PublicExperimentCell = {
  versionNumber: number
  label: string | null
  model: string
  avgScore: number | null
  scoreVariance: number | null
  passRate: number | null
  avgLatencyMs: number | null
  totalCostUsd: number
  scoredRows: number
  cellStatus: string
}

export type PublicExperiment = {
  name: string
  promptTitle: string
  models: string[]
  createdAt: string
  completedAt: string | null
  results: PublicExperimentCell[]
  winMatrix: { a: number; b: number; model: string; meanDiff: number; insufficientSample: boolean }[]
}

export type PublicShare =
  | { resourceType: "promptRun"; sharedAt: string; resource: PublicPromptRun }
  | { resourceType: "datasetRun"; sharedAt: string; resource: PublicDatasetRun }
  | { resourceType: "experiment"; sharedAt: string; resource: PublicExperiment }

const MIN_SCORED_ROWS = 10

function evalSummary(evaluation: {
  totalScore: number | null
  passed: boolean | null
  aiEvalReasoning: string | null
  criteriaScores: unknown
} | undefined): PublicEvalSummary | null {
  if (!evaluation) return null
  const scores = (evaluation.criteriaScores ?? []) as CriterionScore[]
  return {
    totalScore: evaluation.totalScore,
    passed: evaluation.passed,
    aiEvalReasoning: evaluation.aiEvalReasoning,
    criteria: scores.map((c) => ({ name: c.name, score: c.score })),
  }
}

// Unknown token, revoked share, missing resource and soft-deleted prompt all
// return null — the route turns every one of them into the same 404.
export async function resolveShareByToken(token: string): Promise<PublicShare | null> {
  const share = await prisma.share.findUnique({ where: { token } })
  if (!share || share.revokedAt !== null) return null
  const sharedAt = share.createdAt.toISOString()

  if (share.resourceType === "promptRun") {
    const run = await prisma.promptRun.findUnique({
      where: { id: share.resourceId },
      include: {
        prompt: { select: { title: true, deletedAt: true } },
        promptVersion: { select: { versionNumber: true } },
        evaluations: {
          where: { status: "complete" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { totalScore: true, passed: true, aiEvalReasoning: true, criteriaScores: true },
        },
      },
    })
    if (!run || run.prompt.deletedAt !== null) return null
    return {
      resourceType: "promptRun",
      sharedAt,
      resource: {
        promptTitle: run.prompt.title,
        versionNumber: run.promptVersion.versionNumber,
        model: run.model,
        createdAt: run.createdAt.toISOString(),
        responseText: run.responseText,
        latencyMs: run.latencyMs,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        costUsd: run.costUsd,
        finishReason: run.finishReason,
        eval: evalSummary(run.evaluations[0]),
      },
    }
  }

  if (share.resourceType === "datasetRun") {
    const run = await prisma.datasetRun.findUnique({
      where: { id: share.resourceId },
      include: { dataset: { select: { name: true } } },
    })
    if (!run) return null
    const version = await prisma.promptVersion.findUnique({
      where: { id: run.promptVersionId },
      include: { prompt: { select: { title: true, deletedAt: true } } },
    })
    if (!version || version.prompt.deletedAt !== null) return null
    const promptRuns = await prisma.promptRun.findMany({
      where: { datasetRunId: run.id },
      orderBy: { datasetRow: { rowIndex: "asc" } },
      select: {
        responseText: true,
        datasetRow: { select: { rowIndex: true, data: true, expectedOutput: true } },
        evaluations: {
          where: { status: "complete" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { totalScore: true, passed: true },
        },
      },
    })
    return {
      resourceType: "datasetRun",
      sharedAt,
      resource: {
        promptTitle: version.prompt.title,
        versionNumber: version.versionNumber,
        datasetName: run.dataset.name,
        model: run.model,
        createdAt: run.createdAt.toISOString(),
        totalRows: run.totalRows,
        completedRows: run.completedRows,
        failedRows: run.failedRows,
        avgScore: run.avgScore,
        scoreVariance: run.scoreVariance,
        passRate: run.passRate,
        avgLatencyMs: run.avgLatencyMs,
        totalCostUsd: run.totalCostUsd,
        rows: promptRuns.map((r) => ({
          rowIndex: r.datasetRow?.rowIndex ?? -1,
          input: (r.datasetRow?.data ?? {}) as Record<string, string>,
          expectedOutput: r.datasetRow?.expectedOutput ?? null,
          responseText: r.responseText,
          score: r.evaluations[0]?.totalScore ?? null,
          passed: r.evaluations[0]?.passed ?? null,
        })),
      },
    }
  }

  if (share.resourceType === "experiment") {
    const experiment = await prisma.experiment.findUnique({
      where: { id: share.resourceId },
      include: { results: true },
    })
    if (!experiment) return null
    const versions = await prisma.promptVersion.findMany({
      where: { id: { in: experiment.variantVersionIds } },
      include: { prompt: { select: { title: true, deletedAt: true } } },
    })
    if (versions.length === 0 || versions.some((v) => v.prompt.deletedAt !== null)) return null
    const byId = new Map(versions.map((v) => [v.id, v]))
    const numberOf = (versionId: string) => byId.get(versionId)?.versionNumber ?? -1

    return {
      resourceType: "experiment",
      sharedAt,
      resource: {
        name: experiment.name,
        promptTitle: versions[0].prompt.title,
        models: experiment.models,
        createdAt: experiment.createdAt.toISOString(),
        completedAt: experiment.completedAt?.toISOString() ?? null,
        results: experiment.results.map((r) => ({
          versionNumber: numberOf(r.promptVersionId),
          label: byId.get(r.promptVersionId)?.label ?? null,
          model: r.model,
          avgScore: r.avgScore,
          scoreVariance: r.scoreVariance,
          passRate: r.passRate,
          avgLatencyMs: r.avgLatencyMs,
          totalCostUsd: r.totalCostUsd,
          scoredRows: r.scoredRows,
          cellStatus: r.cellStatus,
        })),
        winMatrix: buildPublicWinMatrix(experiment, numberOf),
      },
    }
  }

  return null
}

function buildPublicWinMatrix(
  experiment: {
    variantVersionIds: string[]
    models: string[]
    results: { promptVersionId: string; model: string; avgScore: number | null; scoredRows: number }[]
  },
  numberOf: (versionId: string) => number
): PublicExperiment["winMatrix"] {
  const byKey = new Map(experiment.results.map((r) => [`${r.promptVersionId} ${r.model}`, r]))
  const entries: PublicExperiment["winMatrix"] = []
  for (const model of experiment.models) {
    for (let i = 0; i < experiment.variantVersionIds.length; i++) {
      for (let j = i + 1; j < experiment.variantVersionIds.length; j++) {
        const a = byKey.get(`${experiment.variantVersionIds[i]} ${model}`)
        const b = byKey.get(`${experiment.variantVersionIds[j]} ${model}`)
        if (!a || !b || a.avgScore === null || b.avgScore === null) continue
        entries.push({
          a: numberOf(a.promptVersionId),
          b: numberOf(b.promptVersionId),
          model,
          meanDiff: a.avgScore - b.avgScore,
          insufficientSample: a.scoredRows < MIN_SCORED_ROWS || b.scoredRows < MIN_SCORED_ROWS,
        })
      }
    }
  }
  return entries
}

// Ownership check for share creation — 404 on anything that isn't the
// caller's resource, with no existence leak.
export async function resourceBelongsToUser(
  resourceType: string,
  resourceId: string,
  userId: string
): Promise<boolean> {
  if (resourceType === "promptRun") {
    const run = await prisma.promptRun.findUnique({
      where: { id: resourceId },
      select: { userId: true, prompt: { select: { deletedAt: true } } },
    })
    return run !== null && run.userId === userId && run.prompt.deletedAt === null
  }
  if (resourceType === "datasetRun") {
    const run = await prisma.datasetRun.findUnique({
      where: { id: resourceId },
      select: { userId: true },
    })
    return run !== null && run.userId === userId
  }
  if (resourceType === "experiment") {
    const experiment = await prisma.experiment.findUnique({
      where: { id: resourceId },
      select: { userId: true },
    })
    return experiment !== null && experiment.userId === userId
  }
  return false
}
