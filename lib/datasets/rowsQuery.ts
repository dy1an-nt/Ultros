import { prisma } from "@/lib/prisma"

export const ROWS_DEFAULT_LIMIT = 50
export const ROWS_MAX_LIMIT = 200

// Shared by /api/dataset-runs/:id/rows and the experiment drill-down proxy —
// one query, one row shape, regardless of which surface asks.
export async function fetchDatasetRunRows(datasetRunId: string, offset: number, limit: number) {
  const [total, promptRuns] = await Promise.all([
    prisma.promptRun.count({ where: { datasetRunId } }),
    prisma.promptRun.findMany({
      where: { datasetRunId },
      orderBy: { datasetRow: { rowIndex: "asc" } },
      skip: offset,
      take: limit,
      select: {
        datasetRowId: true,
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
    datasetRowId: r.datasetRowId,
    rowIndex: r.datasetRow?.rowIndex ?? -1,
    input: r.datasetRow?.data ?? {},
    expectedOutput: r.datasetRow?.expectedOutput ?? null,
    responseText: r.responseText,
    latencyMs: r.latencyMs,
    costUsd: r.costUsd,
    finishReason: r.finishReason,
    eval: r.evaluations[0] ?? null,
  }))

  return { rows, total }
}

// Returns parsed pagination or an error message.
export function parsePagination(searchParams: URLSearchParams): { offset: number; limit: number } | { error: string } {
  const offsetParam = searchParams.get("offset")
  const limitParam = searchParams.get("limit")
  const offset = offsetParam !== null ? parseInt(offsetParam, 10) : 0
  let limit = limitParam !== null ? parseInt(limitParam, 10) : ROWS_DEFAULT_LIMIT
  if (Number.isNaN(offset) || offset < 0 || Number.isNaN(limit) || limit < 1) {
    return { error: "offset/limit must be non-negative integers" }
  }
  limit = Math.min(limit, ROWS_MAX_LIMIT)
  return { offset, limit }
}
