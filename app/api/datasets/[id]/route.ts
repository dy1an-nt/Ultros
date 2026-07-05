import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { errorResponse, jsonOk } from "@/lib/api/errors"

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const dataset = await prisma.dataset.findUnique({ where: { id } })
  if (!dataset) return errorResponse("NOT_FOUND")
  if (dataset.userId !== user.id) return errorResponse("FORBIDDEN")

  const pagination = parsePagination(req)
  if (!pagination) {
    return errorResponse("VALIDATION_ERROR", "offset/limit must be non-negative integers")
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: id },
    orderBy: { rowIndex: "asc" },
    skip: pagination.offset,
    take: pagination.limit,
    select: { id: true, rowIndex: true, data: true, expectedOutput: true },
  })

  return jsonOk({ ...dataset, rows })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const dataset = await prisma.dataset.findUnique({ where: { id } })
  if (!dataset) return errorResponse("NOT_FOUND")
  if (dataset.userId !== user.id) return errorResponse("FORBIDDEN")

  const runCount = await prisma.datasetRun.count({ where: { datasetId: id } })
  if (runCount > 0) {
    return errorResponse("CONFLICT", "dataset has runs; delete is blocked to keep run history interpretable")
  }

  await prisma.dataset.delete({ where: { id } })
  return jsonOk({ id })
}
