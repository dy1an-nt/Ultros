import { prisma } from "@/lib/prisma"
import type { Baseline } from "@/app/generated/prisma/client"
import type { BaselineDto } from "@/types/experiment"

// Joins the display context a Baseline row only stores ids for. Names can be
// null after a rubric delete — the baseline's numbers stay valid (snapshots
// live on the Evaluations), only the label is gone.
export async function toBaselineDto(baseline: Baseline): Promise<BaselineDto> {
  const [version, dataset, rubric, run] = await Promise.all([
    prisma.promptVersion.findUnique({
      where: { id: baseline.promptVersionId },
      select: { versionNumber: true },
    }),
    prisma.dataset.findUnique({ where: { id: baseline.datasetId }, select: { name: true } }),
    prisma.rubric.findUnique({ where: { id: baseline.rubricId }, select: { name: true } }),
    prisma.datasetRun.findUnique({ where: { id: baseline.datasetRunId }, select: { model: true } }),
  ])
  return {
    id: baseline.id,
    promptId: baseline.promptId,
    promptVersionId: baseline.promptVersionId,
    versionNumber: version?.versionNumber ?? null,
    datasetId: baseline.datasetId,
    datasetName: dataset?.name ?? null,
    rubricId: baseline.rubricId,
    rubricName: rubric?.name ?? null,
    datasetRunId: baseline.datasetRunId,
    model: run?.model ?? null,
    baselineScore: baseline.baselineScore,
    baselinePassRate: baseline.baselinePassRate,
    setAt: baseline.setAt.toISOString(),
  }
}
