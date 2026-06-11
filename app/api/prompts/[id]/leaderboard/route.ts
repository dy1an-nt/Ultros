import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import type { LeaderboardRow } from "@/types/eval"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (prompt.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const rubricId = req.nextUrl.searchParams.get("rubricId") ?? undefined

  const evaluations = await prisma.evaluation.findMany({
    where: {
      userId: user.id,
      status: "complete",
      ...(rubricId ? { rubricId } : {}),
      promptRun: { promptId: id },
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

  return Response.json({ data, error: null })
}
