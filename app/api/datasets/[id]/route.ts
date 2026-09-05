import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUser } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function parsePagination(req: NextRequest): { offset: number; limit: number } | null {
  const offsetParam = req.nextUrl.searchParams.get("offset")
  const limitParam = req.nextUrl.searchParams.get("limit")
  let offset = 0
  let limit = DEFAULT_LIMIT
  if (offsetParam !== null) {
    offset = parseInt(offsetParam, 10)
    if (Number.isNaN(offset) || offset < 0) return null
  }
  if (limitParam !== null) {
    limit = parseInt(limitParam, 10)
    if (Number.isNaN(limit) || limit < 1) return null
    limit = Math.min(limit, MAX_LIMIT)
  }
  return { offset, limit }
}

export const GET = withUser<{ id: string }>(async ({ req, params, db }) => {
  const dataset = await db.dataset.require(params.id)

  const pagination = parsePagination(req)
  if (!pagination) {
    throw new ApiError("VALIDATION_ERROR", "offset/limit must be non-negative integers")
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: dataset.id },
    orderBy: { rowIndex: "asc" },
    skip: pagination.offset,
    take: pagination.limit,
    select: { id: true, rowIndex: true, data: true, expectedOutput: true },
  })

  return jsonOk({ ...dataset, rows })
})

export const DELETE = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ params, db }) => {
    const dataset = await db.dataset.require(params.id)

    const runCount = await prisma.datasetRun.count({ where: { datasetId: dataset.id } })
    if (runCount > 0) {
      throw new ApiError("CONFLICT", "dataset has runs; delete is blocked to keep run history interpretable")
    }

    await prisma.dataset.delete({ where: { id: dataset.id } })
    return jsonOk({ id: dataset.id })
  }
)
