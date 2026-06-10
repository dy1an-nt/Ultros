import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const run = await prisma.datasetRun.findUnique({ where: { id } })
  if (!run) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (run.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const offsetParam = req.nextUrl.searchParams.get("offset")
  const limitParam = req.nextUrl.searchParams.get("limit")
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : 0
  let limit = limitParam !== null ? parseInt(limitParam, 10) : DEFAULT_LIMIT
  if (Number.isNaN(offset) || offset < 0 || Number.isNaN(limit) || limit < 1) {
    return Response.json({ data: null, error: "offset/limit must be non-negative integers" }, { status: 400 })
  }
  limit = Math.min(limit, MAX_LIMIT)

  const [total, promptRuns] = await Promise.all([
    prisma.promptRun.count({ where: { datasetRunId: id } }),
    prisma.promptRun.findMany({
      where: { datasetRunId: id },
      orderBy: { datasetRow: { rowIndex: "asc" } },
      skip: offset,
      take: limit,
      select: {
        responseText: true,
        latencyMs: true,
        costUsd: true,
        finishReason: true,
        datasetRow: { select: { rowIndex: true, data: true, expectedOutput: true } },
        evaluations: {
          select: { id: true, status: true, totalScore: true, passed: true, criteriaScores: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ])

  const rows = promptRuns.map((r) => ({
    rowIndex: r.datasetRow?.rowIndex ?? -1,
    input: r.datasetRow?.data ?? {},
    expectedOutput: r.datasetRow?.expectedOutput ?? null,
    responseText: r.responseText,
    latencyMs: r.latencyMs,
    costUsd: r.costUsd,
    finishReason: r.finishReason,
    eval: r.evaluations[0] ?? null,
  }))

  return Response.json({ data: { rows, total }, error: null })
}
