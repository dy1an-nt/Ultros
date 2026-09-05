import { fetchDatasetRunRows, parsePagination } from "@/lib/datasets/rowsQuery"
import { withUser } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ req, params, db }) => {
  const run = await db.datasetRun.require(params.id)

  const pagination = parsePagination(req.nextUrl.searchParams)
  if ("error" in pagination) {
    throw new ApiError("VALIDATION_ERROR", pagination.error)
  }

  return jsonOk(await fetchDatasetRunRows(run.id, pagination.offset, pagination.limit))
})
