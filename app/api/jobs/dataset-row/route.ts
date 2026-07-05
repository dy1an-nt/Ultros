import { NextRequest } from "next/server"
import { verifyQstashSignature } from "@/lib/jobs/verifySignature"
import { runDatasetRowJob } from "@/lib/datasets/rowJob"
import { errorResponse, jsonOk } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

// QStash webhook — not authed by Clerk; signature-verified, fail-closed.
export async function POST(req: NextRequest) {
  const sig = await verifyQstashSignature(req, "/api/jobs/dataset-row")
  if (!sig.ok) {
    logger.warn("dataset-row job signature rejected", { status: sig.status })
    return errorResponse(sig.status === 503 ? "SERVICE_UNAVAILABLE" : "UNAUTHORIZED", sig.error)
  }

  let datasetRunId: unknown
  let rowIndex: unknown
  try {
    const body = JSON.parse(sig.body) as { datasetRunId?: unknown; rowIndex?: unknown }
    datasetRunId = body.datasetRunId
    rowIndex = body.rowIndex
  } catch {
    return errorResponse("INVALID_JSON")
  }
  if (!datasetRunId || typeof datasetRunId !== "string") {
    return errorResponse("VALIDATION_ERROR", "datasetRunId is required")
  }
  if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0) {
    return errorResponse("VALIDATION_ERROR", "rowIndex must be a non-negative integer")
  }

  // Row failures are persisted by the job itself (finishReason "error"); a 200
  // tells QStash not to retry — duplicate deliveries are no-ops anyway.
  logger.info("dataset-row job received", { datasetRunId, rowIndex })
  await runDatasetRowJob(datasetRunId, rowIndex)

  return jsonOk({ datasetRunId, rowIndex })
}
