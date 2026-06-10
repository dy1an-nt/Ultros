import { prisma } from "@/lib/prisma"
import { finalizeExperimentCell } from "@/lib/experiments/aggregate"
import { finalizeRegressionIfPending } from "@/lib/regression/finalize"

// Finalization is a recompute from persisted rows, so calling it twice (or
// from two racing jobs) is harmless — both arrive at the same numbers.
// A DatasetRun with judge evals still pending stays "running"; the eval job
// calls this again when the last judge lands.
export async function finalizeIfDone(datasetRunId: string): Promise<void> {
  const run = await prisma.datasetRun.findUnique({ where: { id: datasetRunId } })
  if (!run || run.status === "complete" || run.status === "failed") return
  // Gate on persisted rows, not the progress counters — a job that dies
  // between creating its PromptRun and incrementing can't wedge the batch.
  const persistedRows = await prisma.promptRun.count({ where: { datasetRunId } })
  if (persistedRows < run.totalRows) return

  const blockingEvals = await prisma.evaluation.count({
    where: { promptRun: { datasetRunId }, status: { in: ["pending", "running"] } },
  })
  if (blockingEvals > 0) return

  const promptRuns = await prisma.promptRun.findMany({
    where: { datasetRunId },
    select: {
      latencyMs: true,
      costUsd: true,
      finishReason: true,
      evaluations: {
        select: { status: true, totalScore: true, passed: true, judgeCostUsd: true },
      },
    },
  })

  const okRuns = promptRuns.filter((r) => r.finishReason !== "error")
  const evals = promptRuns
    .flatMap((r) => r.evaluations)
    .filter((e) => e.status === "complete" && e.totalScore !== null)
  const scores = evals.map((e) => e.totalScore as number)

  const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const variance =
    scores.length > 1 && mean !== null
      ? scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / (scores.length - 1)
      : scores.length === 1
        ? 0
        : null
  const passRate = evals.length > 0 ? evals.filter((e) => e.passed).length / evals.length : null
  const judgeCost = evals.reduce((acc, e) => acc + (e.judgeCostUsd ?? 0), 0)
  const totalCostUsd = promptRuns.reduce((acc, r) => acc + r.costUsd, 0) + judgeCost
  const avgLatencyMs =
    okRuns.length > 0
      ? Math.round(okRuns.reduce((acc, r) => acc + r.latencyMs, 0) / okRuns.length)
      : null

  const failedRows = promptRuns.length - okRuns.length
  await prisma.datasetRun.update({
    where: { id: datasetRunId },
    data: {
      status: okRuns.length === 0 ? "failed" : "complete",
      completedRows: okRuns.length,
      failedRows,
      avgScore: mean,
      scoreVariance: variance,
      passRate,
      avgLatencyMs,
      totalCostUsd,
      completedAt: new Date(),
    },
  })

  // Sprint 5 hooks: a terminal DatasetRun may be an experiment cell or a
  // regression run. Both downstream writers are idempotent (upsert / guarded
  // updateMany), so racing finalizers are harmless here too.
  if (run.experimentId) await finalizeExperimentCell(datasetRunId)
  await finalizeRegressionIfPending(datasetRunId)
}
