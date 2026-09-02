import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchDatasetRunRows, parsePagination } from "@/lib/datasets/rowsQuery"
import { errorResponse, jsonOk } from "@/lib/api/errors"

// Per-row drill-down for one experiment cell: ?cell=<datasetRunId>&offset&limit.
// Proxies the cell's DatasetRun rows after verifying the cell belongs to this
// experiment. Same row shape as /api/dataset-runs/:id/rows.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const experiment = await prisma.experiment.findUnique({ where: { id } })
  if (!experiment) return errorResponse("NOT_FOUND")
  if (experiment.userId !== user.id) {
    return errorResponse("FORBIDDEN")
  }

  const cellId = req.nextUrl.searchParams.get("cell")
  if (!cellId) {
    return errorResponse("VALIDATION_ERROR", "cell query param is required")
  }
  const cell = await prisma.datasetRun.findUnique({ where: { id: cellId } })
  if (!cell || cell.experimentId !== id) {
    return errorResponse("VALIDATION_ERROR", "invalid cell")
  }

  const pagination = parsePagination(req.nextUrl.searchParams)
  if ("error" in pagination) {
    return errorResponse("VALIDATION_ERROR", pagination.error)
  }

  const data = await fetchDatasetRunRows(cellId, pagination.offset, pagination.limit)
  return jsonOk(data)
}
