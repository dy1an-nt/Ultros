import { describe, it, expect } from "vitest"
import { GET as getRuns } from "@/app/api/prompts/[id]/runs/route"
import { GET as getEvals } from "@/app/api/prompts/[id]/evals/route"
import { GET as getLeaderboard } from "@/app/api/prompts/[id]/leaderboard/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPrompt, createPromptRun, createEvaluation, validCriteria } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

// Every route here shares the same prompt guard; exercise it once per route.
async function expectPromptGuards(
  handler: (req: ReturnType<typeof jsonRequest>, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  path: (id: string) => string
) {
  const res = await handler(jsonRequest("GET", path("p1")), routeParams({ id: "p1" }))
  expect(res.status).toBe(401)

  const me = await createUser()
  const other = await createUser()
  const theirs = await createPrompt(other.id)
  const deleted = await createPrompt(me.id, { deletedAt: new Date() })

  signInAs(me.clerkId)
  expect((await handler(jsonRequest("GET", path("nope")), routeParams({ id: "nope" }))).status).toBe(404)
  expect((await handler(jsonRequest("GET", path(deleted.id)), routeParams({ id: deleted.id }))).status).toBe(404)
  expect((await handler(jsonRequest("GET", path(theirs.id)), routeParams({ id: theirs.id }))).status).toBe(403)
}

describe("GET /api/prompts/:id/runs", () => {
  it("guards auth, unknown, soft-deleted, and foreign prompts", async () => {
    await expectPromptGuards(getRuns, (id) => `/api/prompts/${id}/runs`)
  })

  it("returns the prompt's runs newest-first with version info", async () => {
    const user = await createUser()
    const { prompt, version, run } = await createPromptRun(user.id)
    const second = await prisma.promptRun.create({
      data: {
        promptVersionId: version.id,
        promptId: prompt.id,
        userId: user.id,
        model: "gpt-6",
        provider: "openai",
        temperature: 0,
        maxTokens: 64,
        inputTokens: 5,
        outputTokens: 7,
        latencyMs: 100,
        costUsd: 0.001,
        responseText: "later run",
        createdAt: new Date(Date.now() + 1000),
      },
    })

    signInAs(user.clerkId)
    const res = await getRuns(jsonRequest("GET", `/api/prompts/${prompt.id}/runs`), routeParams({ id: prompt.id }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.map((r: { id: string }) => r.id)).toEqual([second.id, run.id])
    expect(data[0].promptVersion).toEqual({ versionNumber: 1, label: null })
  })
})

describe("GET /api/prompts/:id/evals", () => {
  it("guards auth, unknown, soft-deleted, and foreign prompts", async () => {
    await expectPromptGuards(getEvals, (id) => `/api/prompts/${id}/evals`)
  })

  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["not a number", "abc"],
  ])("rejects limit=%s with 400", async (_label, limit) => {
    const user = await createUser()
    const { prompt } = await createPromptRun(user.id)
    signInAs(user.clerkId)
    const res = await getEvals(
      jsonRequest("GET", `/api/prompts/${prompt.id}/evals?limit=${limit}`),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(400)
  })

  it("returns eval history newest-first with a flattened run summary, honoring limit", async () => {
    const user = await createUser()
    const { prompt, version, run } = await createPromptRun(user.id)
    await createEvaluation(user.id, run.id)
    const later = await prisma.evaluation.create({
      data: {
        promptRunId: run.id,
        userId: user.id,
        status: "complete",
        totalScore: 0.4,
        passed: false,
        criteriaScores: [],
        criteriaSnapshot: { criteria: validCriteria, passThreshold: 0.7, rubricName: "Test rubric" },
        evalMethod: "deterministic",
        completedAt: new Date(),
        createdAt: new Date(Date.now() + 1000),
      },
    })

    signInAs(user.clerkId)
    const res = await getEvals(
      jsonRequest("GET", `/api/prompts/${prompt.id}/evals?limit=1`),
      routeParams({ id: prompt.id })
    )
    const { data } = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe(later.id)
    expect(data[0].run).toMatchObject({
      id: run.id,
      model: "claude-sonnet-5",
      promptVersionId: version.id,
      versionNumber: 1,
    })
  })
})

describe("GET /api/prompts/:id/leaderboard", () => {
  it("guards auth, unknown, soft-deleted, and foreign prompts", async () => {
    await expectPromptGuards(getLeaderboard, (id) => `/api/prompts/${id}/leaderboard`)
  })

  it("aggregates complete evals per version, sorted by avgScore, ignoring pending ones", async () => {
    const user = await createUser()
    const { prompt, version: v1, run: v1run } = await createPromptRun(user.id)
    const v2 = await prisma.promptVersion.create({
      data: { promptId: prompt.id, versionNumber: 2, userPrompt: "variant", label: "v2" },
    })
    const v2run = await prisma.promptRun.create({
      data: {
        promptVersionId: v2.id,
        promptId: prompt.id,
        userId: user.id,
        model: "claude-sonnet-5",
        provider: "anthropic",
        temperature: 0,
        maxTokens: 64,
        inputTokens: 5,
        outputTokens: 7,
        latencyMs: 100,
        costUsd: 0.001,
        responseText: "v2 answer",
      },
    })

    const snapshot = { criteria: validCriteria, passThreshold: 0.7, rubricName: "Test rubric" }
    const complete = (promptRunId: string, totalScore: number, passed: boolean) => ({
      promptRunId,
      userId: user.id,
      status: "complete",
      totalScore,
      passed,
      criteriaScores: [],
      criteriaSnapshot: snapshot,
      evalMethod: "deterministic",
      completedAt: new Date(),
    })
    // v1: 0.5 and 0.9 → avg 0.7, passRate 0.5; v2: single 0.8
    await prisma.evaluation.create({ data: complete(v1run.id, 0.5, false) })
    await prisma.evaluation.create({ data: complete(v1run.id, 0.9, true) })
    await prisma.evaluation.create({ data: complete(v2run.id, 0.8, true) })
    // pending eval must not count
    await prisma.evaluation.create({
      data: { promptRunId: v2run.id, userId: user.id, status: "pending", criteriaSnapshot: snapshot, evalMethod: "ai_judge" },
    })

    signInAs(user.clerkId)
    const res = await getLeaderboard(
      jsonRequest("GET", `/api/prompts/${prompt.id}/leaderboard`),
      routeParams({ id: prompt.id })
    )
    const { data } = await res.json()
    expect(data).toEqual([
      {
        promptVersionId: v2.id,
        versionNumber: 2,
        label: "v2",
        avgScore: 0.8,
        passRate: 1,
        evalCount: 1,
      },
      {
        promptVersionId: v1.id,
        versionNumber: 1,
        label: null,
        avgScore: expect.closeTo(0.7, 10),
        passRate: 0.5,
        evalCount: 2,
      },
    ])
  })

  it("filters by rubricId when provided", async () => {
    const user = await createUser()
    const { prompt, run } = await createPromptRun(user.id)
    const rubricA = await prisma.rubric.create({
      data: { userId: user.id, name: "A", criteria: validCriteria, passThreshold: 0.7 },
    })
    const snapshot = { criteria: validCriteria, passThreshold: 0.7, rubricName: "A" }
    await prisma.evaluation.create({
      data: {
        promptRunId: run.id,
        userId: user.id,
        rubricId: rubricA.id,
        status: "complete",
        totalScore: 1,
        passed: true,
        criteriaScores: [],
        criteriaSnapshot: snapshot,
        evalMethod: "deterministic",
        completedAt: new Date(),
      },
    })
    await createEvaluation(user.id, run.id) // no rubricId — excluded by the filter

    signInAs(user.clerkId)
    const { data } = await (
      await getLeaderboard(
        jsonRequest("GET", `/api/prompts/${prompt.id}/leaderboard?rubricId=${rubricA.id}`),
        routeParams({ id: prompt.id })
      )
    ).json()
    expect(data).toHaveLength(1)
    expect(data[0].evalCount).toBe(1)
    expect(data[0].avgScore).toBe(1)
  })
})
