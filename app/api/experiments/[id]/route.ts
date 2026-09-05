import { prisma } from "@/lib/prisma"
import type { DatasetRunStatus } from "@/types/dataset"
import type { ExperimentDetailDto } from "@/types/experiment"
import { withUser } from "@/lib/api/handler"
import { jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  const experiment = await db.experiment.require(params.id)

  const [cellRuns, dataset, rubric, versions] = await Promise.all([
    prisma.datasetRun.findMany({
      where: { experimentId: experiment.id },
      select: {
        id: true,
        promptVersionId: true,
        model: true,
        status: true,
        totalRows: true,
        completedRows: true,
        failedRows: true,
      },
    }),
    prisma.dataset.findUnique({ where: { id: experiment.datasetId }, select: { name: true } }),
    prisma.rubric.findUnique({ where: { id: experiment.rubricId }, select: { name: true } }),
    prisma.promptVersion.findMany({
      where: { id: { in: experiment.variantVersionIds } },
      select: { id: true, versionNumber: true, label: true },
    }),
  ])

  const data: ExperimentDetailDto = {
    ...experiment,
    status: experiment.status as ExperimentDetailDto["status"],
    createdAt: experiment.createdAt.toISOString(),
    completedAt: experiment.completedAt?.toISOString() ?? null,
    cells: cellRuns.map((c) => ({
      promptVersionId: c.promptVersionId,
      model: c.model,
      datasetRunId: c.id,
      status: c.status as DatasetRunStatus,
      totalRows: c.totalRows,
      completedRows: c.completedRows,
      failedRows: c.failedRows,
    })),
    datasetName: dataset?.name ?? null,
    rubricName: rubric?.name ?? null,
    versions,
  }
  return jsonOk(data)
})
