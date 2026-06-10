import { NextRequest } from "next/server"
import { verifyQstashSignature } from "@/lib/jobs/verifySignature"
import { runDatasetRowJob } from "@/lib/datasets/rowJob"

// QStash webhook — not authed by Clerk; signature-verified, fail-closed.
export async function POST(req: NextRequest) {
  const sig = await verifyQstashSignature(req, "/api/jobs/dataset-row")
  if (!sig.ok) return Response.json({ data: null, error: sig.error }, { status: sig.status })

  let datasetRunId: unknown
  let rowIndex: unknown
  try {
    const body = JSON.parse(sig.body) as { datasetRunId?: unknown; rowIndex?: unknown }
    datasetRunId = body.datasetRunId
    rowIndex = body.rowIndex
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }
  if (!datasetRunId || typeof datasetRunId !== "string") {
    return Response.json({ data: null, error: "datasetRunId is required" }, { status: 400 })
  }
  if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0) {
    return Response.json({ data: null, error: "rowIndex must be a non-negative integer" }, { status: 400 })
  }

  // Row failures are persisted by the job itself (finishReason "error"); a 200
  // tells QStash not to retry — duplicate deliveries are no-ops anyway.
  await runDatasetRowJob(datasetRunId, rowIndex)

  return Response.json({ data: { datasetRunId, rowIndex }, error: null })
}
