import { describe, it, expect, vi } from "vitest"
import { prisma } from "../helpers/db"
import { createUser, createPrompt, createPromptRun, createEvaluation, createDataset, validCriteria } from "../helpers/seed"
import { jsonRequest, rawRequest } from "../helpers/request"

// The route's own contract is the payload handling; QStash signature
// verification is covered by its own module and stubbed here to pass-through.
vi.mock("@/lib/jobs/verifySignature", () => ({
  verifyQstashSignature: async (req: Request) => ({ ok: true, body: await req.text() }),
}))

const { POST } = await import("@/app/api/jobs/failed/route")

const JOB_URL = "https://app.example.com/api/jobs"

// QStash failure-callback shape: url = original destination, sourceBody =
// base64 of the original message body.
function callback(kind: "eval" | "dataset-row", sourceBody: unknown) {
  return jsonRequest("POST", "/api/jobs/failed", {
    url: `${JOB_URL}/${kind}`,
    sourceBody: Buffer.from(JSON.stringify(sourceBody)).toString("base64"),
    dlqId: "dlq_test_1",
    retried: 3,
  })
}

const snapshot = { criteria: validCriteria, passThreshold: 0.7, rubricName: "Test rubric" }

async function seedRunningDatasetRun(userId: string) {
  const prompt = await createPrompt(userId)
  const version = prompt.versions[0]
  const dataset = await createDataset(userId) // two rows
  const datasetRun = await prisma.datasetRun.create({
    data: {
      userId,
      datasetId: dataset.id,
      promptVersionId: version.id,
      model: "claude-sonnet-5",
      temperature: 0,
      maxTokens: 256,
      variableMapping: {},
      status: "running",
      totalRows: 2,
      completedRows: 1,
    },
  })
  // Row 0 landed normally; row 1 is the one whose delivery may be lost.
  const persisted = await prisma.promptRun.create({
    data: {
      promptVersionId: version.id,
      promptId: prompt.id,
      userId,
      datasetRowId: dataset.rows[0].id,
      datasetRunId: datasetRun.id,
      model: "claude-sonnet-5",
      provider: "anthropic",
      temperature: 0,
      maxTokens: 256,
      inputTokens: 10,
      outputTokens: 20,
      latencyMs: 300,
      costUsd: 0.004,
      responseText: "row 0 answer",
    },
  })
  return { prompt, version, dataset, datasetRun, persisted }
}

describe("POST /api/jobs/failed, eval branch", () => {
  it("rejects a malformed callback body with 400", async () => {
    expect((await POST(rawRequest("POST", "/api/jobs/failed", "{bad"))).status).toBe(400)
  })

  it("acks an unrecognized callback with 200 and touches nothing", async () => {
    const res = await POST(jsonRequest("POST", "/api/jobs/failed", { url: "https://x/api/other" }))
    expect(res.status).toBe(200)
    expect((await res.json()).data.handled).toBeNull()
  })

  it("marks a stranded pending eval failed", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    const evaluation = await prisma.evaluation.create({
      data: {
        promptRunId: run.id,
        userId: user.id,
        status: "pending",
        criteriaSnapshot: snapshot,
        evalMethod: "ai_judge",
      },
    })

    const res = await POST(callback("eval", { evaluationId: evaluation.id }))
    expect(res.status).toBe(200)

    const row = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluation.id } })
    expect(row.status).toBe("failed")
    expect(row.error).toContain("retries exhausted")
  })

  it("never demotes a completed eval. A late callback after a successful delivery is a no-op", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    const evaluation = await createEvaluation(user.id, run.id) // status complete

    await POST(callback("eval", { evaluationId: evaluation.id }))

    const row = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluation.id } })
    expect(row.status).toBe("complete")
    expect(row.error).toBeNull()
  })

  it("unblocks a batch waiting on the stranded eval: the DatasetRun finalizes", async () => {
    const user = await createUser()
    const { datasetRun, persisted, version, dataset } = await seedRunningDatasetRun(user.id)
    // Row 1 also persisted, but its judge eval never got delivered.
    const run1 = await prisma.promptRun.create({
      data: {
        promptVersionId: version.id,
        promptId: (await prisma.promptVersion.findUniqueOrThrow({ where: { id: version.id } })).promptId,
        userId: user.id,
        datasetRowId: dataset.rows[1].id,
        datasetRunId: datasetRun.id,
        model: "claude-sonnet-5",
        provider: "anthropic",
        temperature: 0,
        maxTokens: 256,
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 300,
        costUsd: 0.004,
        responseText: "row 1 answer",
      },
    })
    await createEvaluation(user.id, persisted.id) // row 0 scored
    const stranded = await prisma.evaluation.create({
      data: {
        promptRunId: run1.id,
        userId: user.id,
        status: "pending",
        criteriaSnapshot: snapshot,
        evalMethod: "ai_judge",
      },
    })

    await POST(callback("eval", { evaluationId: stranded.id }))

    const finalized = await prisma.datasetRun.findUniqueOrThrow({ where: { id: datasetRun.id } })
    expect(finalized.status).toBe("complete")
    expect(finalized.completedAt).not.toBeNull()
  })
})

describe("POST /api/jobs/failed, dataset-row branch", () => {
  it("records the lost row as failed and finalizes the batch", async () => {
    const user = await createUser()
    const { datasetRun } = await seedRunningDatasetRun(user.id)

    const res = await POST(callback("dataset-row", { datasetRunId: datasetRun.id, rowIndex: 1 }))
    expect(res.status).toBe(200)

    const failedRun = await prisma.promptRun.findFirstOrThrow({
      where: { datasetRunId: datasetRun.id, finishReason: "error" },
    })
    expect(failedRun.responseText).toContain("retries exhausted")
    expect(failedRun.costUsd).toBe(0)

    const finalized = await prisma.datasetRun.findUniqueOrThrow({ where: { id: datasetRun.id } })
    expect(finalized.failedRows).toBe(1)
    expect(finalized.status).toBe("complete") // both rows persisted, no blocking evals
  })

  it("is a no-op when some delivery already persisted the row", async () => {
    const user = await createUser()
    const { datasetRun } = await seedRunningDatasetRun(user.id)

    await POST(callback("dataset-row", { datasetRunId: datasetRun.id, rowIndex: 0 }))

    const run = await prisma.datasetRun.findUniqueOrThrow({ where: { id: datasetRun.id } })
    expect(run.failedRows).toBe(0)
    expect(await prisma.promptRun.count({ where: { datasetRunId: datasetRun.id } })).toBe(1)
  })

  it("is a no-op on an already-complete run", async () => {
    const user = await createUser()
    const { datasetRun } = await seedRunningDatasetRun(user.id)
    await prisma.datasetRun.update({ where: { id: datasetRun.id }, data: { status: "complete" } })

    await POST(callback("dataset-row", { datasetRunId: datasetRun.id, rowIndex: 1 }))

    expect(await prisma.promptRun.count({ where: { datasetRunId: datasetRun.id } })).toBe(1)
  })
})
