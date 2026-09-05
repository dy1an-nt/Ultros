import { prisma } from "@/lib/prisma"
import { fetchDatasetRunRows, parsePagination } from "@/lib/datasets/rowsQuery"
import { withUser } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

// Per-row drill-down for one experiment cell: ?cell=<datasetRunId>&offset&limit.
// Proxies the cell's DatasetRun rows after verifying the cell belongs to this
// experiment. Same row shape as /api/dataset-runs/:id/rows.
export const GET = withUser<{ id: string }>(async ({ req, params, db }) => {
  const experiment = await db.experiment.require(params.id)

  const cellId = req.nextUrl.searchParams.get("cell")
  if (!cellId) {
    throw new ApiError("VALIDATION_ERROR", "cell query param is required")
  }
  const cell = await prisma.datasetRun.findUnique({ where: { id: cellId } })
  if (!cell || cell.experimentId !== experiment.id) {
    throw new ApiError("VALIDATION_ERROR", "invalid cell")
  }

  const pagination = parsePagination(req.nextUrl.searchParams)
  if ("error" in pagination) {
    throw new ApiError("VALIDATION_ERROR", pagination.error)
  }

  return jsonOk(await fetchDatasetRunRows(cellId, pagination.offset, pagination.limit))
})
