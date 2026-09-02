import { prisma } from "@/lib/prisma"
import { compareToBaseline, type RowEvalScore } from "./compare"

// The regression intent (baseline, new version, threshold) is persisted as a
// pending RegressionRun at launch; this hook, called from finalizeIfDone when
// any DatasetRun goes terminal, fills in the verdict, the status-guarded
// updateMany makes double-finalize a no-op.
export async function finalizeRegressionIfPending(datasetRunId: string): Promise<void> {
  const pending = await prisma.regressionRun.findUnique({ where: { datasetRunId } })
  if (!pending || pending.status !== "pending") return

  const run = await prisma.datasetRun.findUnique({ where: { id: datasetRunId } })
  if (!run) return
  if (run.status !== "complete" && run.status !== "failed") return

  // A run that finished without scores (all rows failed, or the rubric was
  // deleted mid-run) cannot be compared, surface that instead of a fake delta.
  if (run.status === "failed" || run.avgScore === null || run.passRate === null) {
    await prisma.regressionRun.updateMany({
      where: { id: pending.id, status: "pending" },
      data: { status: "failed", completedAt: new Date() },
    })
    return
  }

  const baseline = await prisma.baseline.findUnique({ where: { id: pending.baselineId } })
  if (!baseline) return

  const [baselineRows, newRows] = await Promise.all([
    fetchRowScores(baseline.datasetRunId),
    fetchRowScores(datasetRunId),
  ])
  const comparison = compareToBaseline({
    baselineScore: baseline.baselineScore,
    newScore: run.avgScore,
    threshold: pending.threshold,
    baselineRows,
    newRows,
  })

  await prisma.regressionRun.updateMany({
    where: { id: pending.id, status: "pending" },
    data: {
      status: "complete",
      newScore: run.avgScore,
      newPassRate: run.passRate,
      scoreDelta: comparison.scoreDelta,
      regressed: comparison.regressed,
      regressedRowIds: comparison.regressedRowIds,
      completedAt: new Date(),
    },
  })
}

// Latest complete evaluation per row of a DatasetRun, keyed for rowIndex matching.
async function fetchRowScores(datasetRunId: string): Promise<RowEvalScore[]> {
  const promptRuns = await prisma.promptRun.findMany({
    where: { datasetRunId, datasetRowId: { not: null } },
    select: {
      datasetRowId: true,
      datasetRow: { select: { rowIndex: true } },
      evaluations: {
        where: { status: "complete" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { totalScore: true, passed: true },
      },
    },
  })
  return promptRuns
    .filter((r) => r.datasetRowId !== null && r.datasetRow !== null)
    .map((r) => ({
      datasetRowId: r.datasetRowId as string,
      rowIndex: (r.datasetRow as { rowIndex: number }).rowIndex,
      score: r.evaluations[0]?.totalScore ?? null,
      passed: r.evaluations[0]?.passed ?? null,
    }))
}
