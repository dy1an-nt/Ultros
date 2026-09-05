import { prisma } from "@/lib/prisma"
import { buildWinMatrix, mean } from "@/lib/experiments/stats"
import type { CriterionScore } from "@/types/eval"
import type { CriterionStat, ExperimentResultsDto } from "@/types/experiment"
import { withUser } from "@/lib/api/handler"
import { jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  const experiment = await db.experiment.require(params.id)

  const results = await prisma.experimentResult.findMany({ where: { experimentId: experiment.id } })

  const winMatrix = buildWinMatrix(
    results.map((r) => ({
      promptVersionId: r.promptVersionId,
      model: r.model,
      avgScore: r.avgScore,
      scoredRows: r.scoredRows,
    })),
    experiment.variantVersionIds,
    experiment.models
  )

  // Per-criterion means: pull every complete evaluation of every cell once,
  // group scores by (cell, criterion name).
  const cellByRunId = new Map(results.map((r) => [r.datasetRunId, r]))
  const evaluations = await prisma.evaluation.findMany({
    where: {
      status: "complete",
      promptRun: { datasetRunId: { in: results.map((r) => r.datasetRunId) } },
    },
    select: { criteriaScores: true, promptRun: { select: { datasetRunId: true } } },
  })
  const grouped = new Map<string, { promptVersionId: string; model: string; criterion: string; scores: number[] }>()
  for (const evaluation of evaluations) {
    const cell = cellByRunId.get(evaluation.promptRun.datasetRunId ?? "")
    if (!cell) continue
    const scores = (evaluation.criteriaScores ?? []) as CriterionScore[]
    for (const cs of scores) {
      // NUL separator, not a space: criterion names are user-supplied and may
      // contain anything a space would let collide across cells.
      const key = `${cell.promptVersionId}\0${cell.model}\0${cs.name}`
      const entry = grouped.get(key) ?? {
        promptVersionId: cell.promptVersionId,
        model: cell.model,
        criterion: cs.name,
        scores: [],
      }
      entry.scores.push(cs.score)
      grouped.set(key, entry)
    }
  }
  const criterionStats: CriterionStat[] = [...grouped.values()].map((g) => ({
    promptVersionId: g.promptVersionId,
    model: g.model,
    criterion: g.criterion,
    avgScore: mean(g.scores) as number,
    count: g.scores.length,
  }))

  const data: ExperimentResultsDto = {
    results: results.map((r) => ({
      promptVersionId: r.promptVersionId,
      model: r.model,
      datasetRunId: r.datasetRunId,
      avgScore: r.avgScore,
      scoreVariance: r.scoreVariance,
      avgLatencyMs: r.avgLatencyMs,
      passRate: r.passRate,
      totalCostUsd: r.totalCostUsd,
      scoredRows: r.scoredRows,
      cellStatus: r.cellStatus as "complete" | "failed",
    })),
    winMatrix,
    criterionStats,
  }
  return jsonOk(data)
})
