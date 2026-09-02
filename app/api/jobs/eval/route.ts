import { NextRequest } from "next/server"
import { verifyQstashSignature } from "@/lib/jobs/verifySignature"
import { runEvalJob } from "@/lib/eval/runEvalJob"
import { errorResponse, jsonOk } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

// QStash webhook, not authed by Clerk; signature-verified, fail-closed.
export async function POST(req: NextRequest) {
  const sig = await verifyQstashSignature(req, "/api/jobs/eval")
  if (!sig.ok) {
    logger.warn("eval job signature rejected", { status: sig.status })
    return errorResponse(sig.status === 503 ? "SERVICE_UNAVAILABLE" : "UNAUTHORIZED", sig.error)
  }

  let evaluationId: unknown
  try {
    evaluationId = (JSON.parse(sig.body) as { evaluationId?: unknown }).evaluationId
  } catch {
    return errorResponse("INVALID_JSON")
  }
  if (!evaluationId || typeof evaluationId !== "string") {
    return errorResponse("VALIDATION_ERROR", "evaluationId is required")
  }

  // runEvalJob never throws on eval failure. It records status "failed" on
  // the row. A 200 here tells QStash not to retry; retries are handled by the
  // idempotent claim transition inside the job.
  logger.info("eval job received", { evaluationId })
  await runEvalJob(evaluationId)

  return jsonOk({ evaluationId })
}
