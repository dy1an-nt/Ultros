import { prisma } from "@/lib/prisma"
import type { LeaderboardRow } from "@/types/eval"
import { withUser } from "@/lib/api/handler"
import { jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ req, params, db }) => {
  const prompt = await db.prompt.require(params.id)

  const rubricId = req.nextUrl.searchParams.get("rubricId") ?? undefined

  const evaluations = await prisma.evaluation.findMany({
    where: {
      ...db.scope,
      status: "complete",
      ...(rubricId ? { rubricId } : {}),
      promptRun: { promptId: prompt.id },
    },
    select: {
      totalScore: true,
      passed: true,
      promptRun: {
        select: {
          promptVersionId: true,
          promptVersion: { select: { versionNumber: true, label: true } },
        },
      },
    },
  })

  const byVersion = new Map<
    string,
    { versionNumber: number; label: string | null; scoreSum: number; passCount: number; evalCount: number }
  >()

  for (const evaluation of evaluations) {
    const { promptVersionId, promptVersion } = evaluation.promptRun
    const bucket = byVersion.get(promptVersionId) ?? {
      versionNumber: promptVersion.versionNumber,
      label: promptVersion.label,
      scoreSum: 0,
      passCount: 0,
      evalCount: 0,
    }
    bucket.scoreSum += evaluation.totalScore ?? 0
    bucket.passCount += evaluation.passed ? 1 : 0
    bucket.evalCount += 1
    byVersion.set(promptVersionId, bucket)
  }

  const data: LeaderboardRow[] = [...byVersion.entries()]
    .map(([promptVersionId, b]) => ({
      promptVersionId,
      versionNumber: b.versionNumber,
      label: b.label,
      avgScore: b.scoreSum / b.evalCount,
      passRate: b.passCount / b.evalCount,
      evalCount: b.evalCount,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  return jsonOk(data)
})
