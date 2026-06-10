import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchDatasetRunRows, parsePagination } from "@/lib/datasets/rowsQuery"

// Per-row drill-down for one experiment cell: ?cell=<datasetRunId>&offset&limit.
// Proxies the cell's DatasetRun rows after verifying the cell belongs to this
// experiment — same row shape as /api/dataset-runs/:id/rows.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const experiment = await prisma.experiment.findUnique({ where: { id } })
  if (!experiment) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (experiment.userId !== user.id) {
    return Response.json({ data: null, error: "Forbidden" }, { status: 403 })
  }

  const cellId = req.nextUrl.searchParams.get("cell")
  if (!cellId) {
    return Response.json({ data: null, error: "cell query param is required" }, { status: 400 })
  }
  const cell = await prisma.datasetRun.findUnique({ where: { id: cellId } })
  if (!cell || cell.experimentId !== id) {
    return Response.json({ data: null, error: "invalid cell" }, { status: 400 })
  }

  const pagination = parsePagination(req.nextUrl.searchParams)
  if ("error" in pagination) {
    return Response.json({ data: null, error: pagination.error }, { status: 400 })
  }

  const data = await fetchDatasetRunRows(cellId, pagination.offset, pagination.limit)
  return Response.json({ data, error: null })
}
