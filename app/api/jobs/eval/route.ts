import { NextRequest } from "next/server"
import { Receiver } from "@upstash/qstash"
import { runEvalJob } from "@/lib/eval/runEvalJob"

// QStash webhook — the only route not authed by Clerk. Without signing keys
// it must refuse to run (503), never fall open: an unsigned endpoint that
// executes arbitrary evaluationIds would let anyone burn judge tokens.
export async function POST(req: NextRequest) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!currentSigningKey || !nextSigningKey) {
    return Response.json({ data: null, error: "Eval job queue not configured" }, { status: 503 })
  }

  const signature = req.headers.get("upstash-signature")
  if (!signature) {
    return Response.json({ data: null, error: "Missing signature" }, { status: 401 })
  }

  const body = await req.text()
  const receiver = new Receiver({ currentSigningKey, nextSigningKey })
  try {
    const valid = await receiver.verify({ signature, body })
    if (!valid) throw new Error("invalid")
  } catch {
    return Response.json({ data: null, error: "Invalid signature" }, { status: 401 })
  }

  let evaluationId: unknown
  try {
    evaluationId = (JSON.parse(body) as { evaluationId?: unknown }).evaluationId
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
