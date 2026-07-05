import { describe, it, expect, vi, beforeEach } from "vitest"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPromptRun } from "../helpers/seed"

// The sprint-7 QStash fix in one test: at-least-once delivery means two
// workers can receive the same eval job. The leased claim must let exactly
// one of them reach the judge. This mock counts judge invocations and holds
// each call open briefly so a broken claim would overlap them.
let judgeCalls = 0
vi.mock("@/lib/eval/judge", () => ({
  judgeCriteria: async () => {
    judgeCalls += 1
    await new Promise((r) => setTimeout(r, 50))
    return {
      scores: [{ name: "Judge quality", type: "ai_judge", weight: 100, score: 0.9, detail: "stub verdict" }],
      reasoning: "stubbed reasoning",
      model: "judge-stub",
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.0005,
    }
  },
}))

const { runEvalJob, EVAL_LEASE_MS } = await import("@/lib/eval/runEvalJob")

beforeEach(() => {
  judgeCalls = 0
})

const judgeSnapshot = {
  rubricName: "Judge rubric",
  passThreshold: 0.7,
  criteria: [{ name: "Judge quality", type: "ai_judge", weight: 100, config: { instructions: "Rate it" } }],
}

async function seedPendingJudgeEval() {
  const user = await createUser()
  signInAs(user.clerkId)
  const { run } = await createPromptRun(user.id)
  const evaluation = await prisma.evaluation.create({
    data: {
      promptRunId: run.id,
      userId: user.id,
      status: "pending",
      criteriaScores: [],
      criteriaSnapshot: judgeSnapshot,
      evalMethod: "ai_judge",
    },
  })
  return { user, evaluation }
}

describe("runEvalJob leased claim under concurrent delivery", () => {
  it("two simultaneous deliveries produce exactly one judge call and one completion", async () => {
    const { user, evaluation } = await seedPendingJudgeEval()

    await Promise.all([runEvalJob(evaluation.id), runEvalJob(evaluation.id)])

    expect(judgeCalls).toBe(1)

    const done = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluation.id } })
    expect(done.status).toBe("complete")
    expect(done.totalScore).toBeCloseTo(0.9, 10)
    expect(done.passed).toBe(true)

    // The double-increment was the observable symptom of the original bug.
    const usage = await prisma.usageSummary.findFirstOrThrow({ where: { userId: user.id } })
    expect(usage.totalInputTokens).toBe(100)
    expect(usage.totalOutputTokens).toBe(20)
    expect(usage.totalRuns).toBe(0) // judge calls are not user runs
  })

  it("a completed eval is never re-run by a late duplicate delivery", async () => {
    const { evaluation } = await seedPendingJudgeEval()
    await runEvalJob(evaluation.id)
    expect(judgeCalls).toBe(1)

    await runEvalJob(evaluation.id) // duplicate arrives after completion
    expect(judgeCalls).toBe(1)
    const done = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluation.id } })
    expect(done.status).toBe("complete")
  })

  it("a fresh running row (live lease) is not reclaimed", async () => {
    const { evaluation } = await seedPendingJudgeEval()
    await prisma.evaluation.update({
      where: { id: evaluation.id },
      data: { status: "running", startedAt: new Date() },
    })

    await runEvalJob(evaluation.id)

    expect(judgeCalls).toBe(0)
    const row = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluation.id } })
    expect(row.status).toBe("running") // still the live worker's job
  })

  it("a stale running row (lapsed lease) is reclaimed and completed", async () => {
    const { evaluation } = await seedPendingJudgeEval()
    await prisma.evaluation.update({
      where: { id: evaluation.id },
      data: { status: "running", startedAt: new Date(Date.now() - EVAL_LEASE_MS - 1000) },
    })

    await runEvalJob(evaluation.id)

    expect(judgeCalls).toBe(1)
    const row = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluation.id } })
    expect(row.status).toBe("complete")
  })
})
