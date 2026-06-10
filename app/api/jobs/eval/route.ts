import { NextRequest } from "next/server"
import { verifyQstashSignature } from "@/lib/jobs/verifySignature"
import { runEvalJob } from "@/lib/eval/runEvalJob"

// QStash webhook — not authed by Clerk; signature-verified, fail-closed.
export async function POST(req: NextRequest) {
  const sig = await verifyQstashSignature(req, "/api/jobs/eval")
  if (!sig.ok) return Response.json({ data: null, error: sig.error }, { status: sig.status })

  let evaluationId: unknown
  try {
    evaluationId = (JSON.parse(sig.body) as { evaluationId?: unknown }).evaluationId
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }
  if (!evaluationId || typeof evaluationId !== "string") {
    return Response.json({ data: null, error: "evaluationId is required" }, { status: 400 })
  }

  // runEvalJob never throws on eval failure — it records status "failed" on
  // the row. A 200 here tells QStash not to retry; retries are handled by the
  // idempotent claim transition inside the job.
  await runEvalJob(evaluationId)

  return Response.json({ data: { evaluationId }, error: null })
}
