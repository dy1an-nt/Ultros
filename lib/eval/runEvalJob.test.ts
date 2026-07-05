import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock every IO dependency so the job's control flow is testable without a DB,
// an LLM call, or QStash. We assert the *idempotency contract*: a job whose
// claim matches nothing does no work and writes nothing.
const updateMany = vi.fn()
const findUnique = vi.fn()
const update = vi.fn()
const usageUpsert = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evaluation: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
    usageSummary: { upsert: (...a: unknown[]) => usageUpsert(...a) },
  },
}))

const judgeCriteria = vi.fn()
vi.mock("./judge", () => ({ judgeCriteria: (...a: unknown[]) => judgeCriteria(...a) }))

const finalizeIfDone = vi.fn()
vi.mock("@/lib/datasets/finalize", () => ({ finalizeIfDone: (...a: unknown[]) => finalizeIfDone(...a) }))

import { runEvalJob, EVAL_LEASE_MS } from "./runEvalJob"

const deterministicEval = {
  id: "eval-1",
  userId: "user-1",
  criteriaSnapshot: { rubricName: "r", passThreshold: 0.5, criteria: [{ name: "a", type: "contains", weight: 1, config: { substring: "x" } }] },
  criteriaScores: [{ name: "a", type: "contains", weight: 1, score: 1 }],
  promptRun: { responseText: "x", datasetRunId: null },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("runEvalJob — idempotent claim", () => {
  it("no-ops when the claim matches 0 rows (duplicate / already-complete delivery)", async () => {
    updateMany.mockResolvedValue({ count: 0 })

    await runEvalJob("eval-1")

    expect(findUnique).not.toHaveBeenCalled()
    expect(judgeCriteria).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(usageUpsert).not.toHaveBeenCalled()
  })

  it("the claim WHERE only matches non-running or stale-lease rows", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    await runEvalJob("eval-1")

    const where = updateMany.mock.calls[0][0].where
    // A freshly-stamped `running` row is excluded: the only running branches
    // require an expired or null lease.
    const runningBranches = where.OR.filter(
      (b: Record<string, unknown>) => b.status === "running"
    )
    expect(runningBranches).toHaveLength(2)
    const lt = runningBranches.find((b: { startedAt?: { lt?: Date } }) => b.startedAt?.lt)
    const cutoff = lt.startedAt.lt as Date
    // Cutoff is roughly one lease-length in the past.
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(EVAL_LEASE_MS - 1000)
    // The claim stamps a fresh lease so it blocks the next concurrent delivery.
    expect(updateMany.mock.calls[0][0].data.startedAt).toBeInstanceOf(Date)
  })

  it("completes a deterministic-only eval without calling the judge", async () => {
    updateMany.mockResolvedValue({ count: 1 })
    findUnique.mockResolvedValue(deterministicEval)
    update.mockResolvedValue({})

    await runEvalJob("eval-1")

    expect(judgeCriteria).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe("complete")
    expect(data.totalScore).toBe(1)
    expect(data.passed).toBe(true)
  })

  it("returns without writing when the claimed eval has vanished", async () => {
    updateMany.mockResolvedValue({ count: 1 })
    findUnique.mockResolvedValue(null)

    await runEvalJob("eval-1")

    expect(update).not.toHaveBeenCalled()
    expect(judgeCriteria).not.toHaveBeenCalled()
  })

  it("marks the eval failed (sanitized) when judging throws, and never rethrows", async () => {
    updateMany.mockResolvedValue({ count: 1 })
    findUnique
      .mockResolvedValueOnce({
        ...deterministicEval,
        criteriaSnapshot: {
          rubricName: "r",
          passThreshold: 0.5,
          criteria: [{ name: "j", type: "ai_judge", weight: 1, config: { instructions: "grade it" } }],
        },
        criteriaScores: [],
      })
      // second findUnique is the post-failure datasetRunId lookup
      .mockResolvedValueOnce({ promptRun: { datasetRunId: null } })
    judgeCriteria.mockRejectedValue(new Error("judge exploded"))
    update.mockResolvedValue({})

    await expect(runEvalJob("eval-1")).resolves.toBeUndefined()

    const failWrite = update.mock.calls.find((c) => c[0].data.status === "failed")
    expect(failWrite).toBeTruthy()
  })
})
