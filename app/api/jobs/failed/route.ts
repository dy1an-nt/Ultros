import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyQstashSignature } from "@/lib/jobs/verifySignature"
import { markRowFailed } from "@/lib/datasets/rowJob"
import { finalizeIfDone } from "@/lib/datasets/finalize"
import { errorResponse, jsonOk } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const FAILURE_MESSAGE = "delivery failed: QStash retries exhausted"

// QStash failure callback, invoked once a job message exhausts all delivery
// retries (the message also lands in QStash's DLQ for inspection). Without
// this hook a permanently-lost delivery strands an Evaluation in
// pending/running and wedges its DatasetRun one row short of finalizing,
// forever. Signature-verified and fail-closed, like the job routes.
//
// Callback payload (QStash-defined): `url` is the original destination and
// `sourceBody` is the base64-encoded original message body.
export async function POST(req: NextRequest) {
  const sig = await verifyQstashSignature(req, "/api/jobs/failed")
  if (!sig.ok) {
    logger.warn("failure callback signature rejected", { status: sig.status })
    return errorResponse(sig.status === 503 ? "SERVICE_UNAVAILABLE" : "UNAUTHORIZED", sig.error)
  }

  let payload: { url?: unknown; sourceBody?: unknown; dlqId?: unknown }
  try {
    payload = JSON.parse(sig.body)
  } catch {
    return errorResponse("INVALID_JSON")
  }
  const url = typeof payload.url === "string" ? payload.url : ""
  const dlqId = typeof payload.dlqId === "string" ? payload.dlqId : undefined

  let original: Record<string, unknown> = {}
  if (typeof payload.sourceBody === "string") {
    try {
      original = JSON.parse(Buffer.from(payload.sourceBody, "base64").toString("utf8"))
    } catch {
      // fall through to the unrecognized branch below
    }
  }

  if (url.endsWith("/api/jobs/eval") && typeof original.evaluationId === "string") {
    const evaluationId = original.evaluationId
    // Only a still-open eval is stranded; a complete/failed one already
    // resolved through some earlier delivery.
    const updated = await prisma.evaluation.updateMany({
      where: { id: evaluationId, status: { in: ["pending", "running"] } },
      data: { status: "failed", error: FAILURE_MESSAGE },
    })
    if (updated.count > 0) {
      const evaluation = await prisma.evaluation.findUnique({
        where: { id: evaluationId },
        select: { promptRun: { select: { datasetRunId: true } } },
      })
      // A failed eval no longer blocks finalization. Let its batch close out.
      if (evaluation?.promptRun.datasetRunId) await finalizeIfDone(evaluation.promptRun.datasetRunId)
    }
    logger.error("eval job delivery failed permanently", { evaluationId, dlqId, marked: updated.count > 0 })
    return jsonOk({ handled: "eval", evaluationId })
  }

  if (
    url.endsWith("/api/jobs/dataset-row") &&
    typeof original.datasetRunId === "string" &&
    typeof original.rowIndex === "number"
  ) {
    const { datasetRunId, rowIndex } = original
    await markRowFailed(datasetRunId, rowIndex, FAILURE_MESSAGE)
    logger.error("dataset-row job delivery failed permanently", { datasetRunId, rowIndex, dlqId })
    return jsonOk({ handled: "dataset-row", datasetRunId, rowIndex })
  }

  // Unrecognized or garbled callback: ack with 200 so QStash doesn't retry
  // the callback itself. The original message stays in the DLQ either way.
  logger.warn("unrecognized failure callback", { url, dlqId })
  return jsonOk({ handled: null })
}
