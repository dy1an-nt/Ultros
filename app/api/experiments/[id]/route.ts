import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import type { DatasetRunStatus } from "@/types/dataset"
import type { ExperimentDetailDto } from "@/types/experiment"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const experiment = await prisma.experiment.findUnique({ where: { id } })
  if (!experiment) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (experiment.userId !== user.id) {
    return Response.json({ data: null, error: "Forbidden" }, { status: 403 })
  }

  const [cellRuns, dataset, rubric, versions] = await Promise.all([
    prisma.datasetRun.findMany({
      where: { experimentId: id },
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
  return Response.json({ data, error: null })
}
