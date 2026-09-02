import { prisma } from "@/lib/prisma"

// Called from finalizeIfDone when a cell (a DatasetRun with experimentId set)
// reaches a terminal state: materialize the cell's aggregates into an
// ExperimentResult, then mark the Experiment complete if this was the last
// cell. The @@unique([experimentId, promptVersionId, model]) upsert is the
// idempotency seam, double-finalize writes the same numbers twice.
export async function finalizeExperimentCell(datasetRunId: string): Promise<void> {
  const run = await prisma.datasetRun.findUnique({ where: { id: datasetRunId } })
  if (!run || !run.experimentId) return
  if (run.status !== "complete" && run.status !== "failed") return

  const experiment = await prisma.experiment.findUnique({ where: { id: run.experimentId } })
  if (!experiment) return

  const scoredRows = await prisma.evaluation.count({
    where: { promptRun: { datasetRunId }, status: "complete", totalScore: { not: null } },
  })

  const cellData = {
    datasetRunId,
    avgScore: run.avgScore,
    scoreVariance: run.scoreVariance,
    avgLatencyMs: run.avgLatencyMs,
    passRate: run.passRate,
    totalCostUsd: run.totalCostUsd,
    scoredRows,
    cellStatus: run.status,
  }
  await prisma.experimentResult.upsert({
    where: {
      experimentId_promptVersionId_model: {
        experimentId: experiment.id,
        promptVersionId: run.promptVersionId,
        model: run.model,
      },
    },
    create: {
      experimentId: experiment.id,
      promptVersionId: run.promptVersionId,
      model: run.model,
      ...cellData,
    },
    update: cellData,
  })

  const expectedCells = experiment.variantVersionIds.length * experiment.models.length
  const terminalCells = await prisma.datasetRun.count({
    where: { experimentId: experiment.id, status: { in: ["complete", "failed"] } },
  })
  if (terminalCells >= expectedCells) {
    await prisma.experiment.updateMany({
      where: { id: experiment.id, status: { not: "complete" } },
      data: { status: "complete", completedAt: new Date() },
    })
  }
}
