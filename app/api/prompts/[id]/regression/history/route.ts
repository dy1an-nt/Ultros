import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { finalizeRegressionIfPending } from "@/lib/regression/finalize"
import { toBaselineDto } from "@/lib/regression/baseline"
import type { RegressionHistoryDto, RegressionRunDto } from "@/types/experiment"
import { errorResponse, jsonOk } from "@/lib/api/errors"

// Score-over-time feed: the current baseline plus its RegressionRuns,
// newest-first. Pending rows whose DatasetRun already went terminal are
// finalized lazily here, so a lost finalize hook can never wedge a run in
// "pending" forever.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null || prompt.userId !== user.id) {
    return errorResponse("NOT_FOUND")
  }

  const baseline = await prisma.baseline.findUnique({ where: { promptId: id } })
  if (!baseline) {
    const empty: RegressionHistoryDto = { baseline: null, runs: [] }
    return jsonOk(empty)
  }

  let runs = await prisma.regressionRun.findMany({
    where: { baselineId: baseline.id },
    orderBy: { createdAt: "desc" },
  })
  const stalePending = runs.filter((r) => r.status === "pending")
  if (stalePending.length > 0) {
    for (const r of stalePending) await finalizeRegressionIfPending(r.datasetRunId)
    runs = await prisma.regressionRun.findMany({
      where: { baselineId: baseline.id },
      orderBy: { createdAt: "desc" },
    })
  }

  const versions = await prisma.promptVersion.findMany({
    where: { id: { in: [...new Set(runs.map((r) => r.newVersionId))] } },
    select: { id: true, versionNumber: true },
  })
  const versionNumberById = new Map(versions.map((v) => [v.id, v.versionNumber]))

  const data: RegressionHistoryDto = {
    baseline: await toBaselineDto(baseline),
    runs: runs.map(
      (r): RegressionRunDto => ({
        id: r.id,
        newVersionId: r.newVersionId,
        versionNumber: versionNumberById.get(r.newVersionId) ?? null,
        datasetRunId: r.datasetRunId,
        status: r.status as RegressionRunDto["status"],
        newScore: r.newScore,
        newPassRate: r.newPassRate,
        scoreDelta: r.scoreDelta,
        threshold: r.threshold,
        regressed: r.regressed,
        regressedRowIds: r.regressedRowIds,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })
    ),
  }
  return jsonOk(data)
}
