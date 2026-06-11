import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"

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
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const dataset = await prisma.dataset.findUnique({ where: { id } })
  if (!dataset) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (dataset.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const pagination = parsePagination(req)
  if (!pagination) {
    return Response.json({ data: null, error: "offset/limit must be non-negative integers" }, { status: 400 })
  }

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: id },
    orderBy: { rowIndex: "asc" },
    skip: pagination.offset,
    take: pagination.limit,
    select: { id: true, rowIndex: true, data: true, expectedOutput: true },
  })

  return Response.json({ data: { ...dataset, rows }, error: null })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const dataset = await prisma.dataset.findUnique({ where: { id } })
  if (!dataset) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (dataset.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const runCount = await prisma.datasetRun.count({ where: { datasetId: id } })
  if (runCount > 0) {
    return Response.json(
      { data: null, error: "dataset has runs; delete is blocked to keep run history interpretable" },
      { status: 409 }
    )
  }

  await prisma.dataset.delete({ where: { id } })
  return Response.json({ data: { id }, error: null })
}
