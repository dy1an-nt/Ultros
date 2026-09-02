import { describe, it, expect } from "vitest"
import { POST as postEval } from "@/app/api/runs/[runId]/eval/route"
import { GET as getEval } from "@/app/api/evals/[id]/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPromptRun, createRubric, createEvaluation, validCriteria } from "../helpers/seed"
import { jsonRequest, rawRequest, routeParams } from "../helpers/request"

// Criteria that both hit against the seeded run's responseText "Hello, Ada!"
const passingCriteria = [
  { name: "Exact", type: "exact", weight: 60, config: { expected: "Hello, Ada!" } },
  { name: "Mentions Ada", type: "contains", weight: 40, config: { substring: "Ada" } },
]

describe("POST /api/runs/:runId/eval", () => {
  it("returns 401 when signed out", async () => {
    const res = await postEval(jsonRequest("POST", "/api/runs/r1/eval", { rubricId: "x" }), routeParams({ runId: "r1" }))
    expect(res.status).toBe(401)
  })

  it("rejects a malformed JSON body with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const { run } = await createPromptRun(user.id)
    const res = await postEval(rawRequest("POST", `/api/runs/${run.id}/eval`, "{bad"), routeParams({ runId: run.id }))
    expect(res.status).toBe(400)
  })

  it("rejects a missing rubricId with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const { run } = await createPromptRun(user.id)
    const res = await postEval(jsonRequest("POST", `/api/runs/${run.id}/eval`, {}), routeParams({ runId: run.id }))
    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown run and 403 for another user's run", async () => {
    const me = await createUser()
    const other = await createUser()
    const rubric = await createRubric(me.id)
    const theirs = await createPromptRun(other.id)

    signInAs(me.clerkId)
    const missing = await postEval(
      jsonRequest("POST", "/api/runs/nope/eval", { rubricId: rubric.id }),
      routeParams({ runId: "nope" })
    )
    expect(missing.status).toBe(404)

    const foreign = await postEval(
      jsonRequest("POST", `/api/runs/${theirs.run.id}/eval`, { rubricId: rubric.id }),
      routeParams({ runId: theirs.run.id })
    )
    expect(foreign.status).toBe(403)
  })

  it("rejects a foreign rubric with a capability-hiding 400, same as an unknown one", async () => {
    const me = await createUser()
    const other = await createUser()
    const theirRubric = await createRubric(other.id)
    const { run } = await createPromptRun(me.id)

    signInAs(me.clerkId)
    const foreign = await postEval(
      jsonRequest("POST", `/api/runs/${run.id}/eval`, { rubricId: theirRubric.id }),
      routeParams({ runId: run.id })
    )
    const unknown = await postEval(
      jsonRequest("POST", `/api/runs/${run.id}/eval`, { rubricId: "nope" }),
      routeParams({ runId: run.id })
    )
    expect(foreign.status).toBe(400)
    expect(unknown.status).toBe(400)
    expect((await foreign.json()).error).toEqual((await unknown.json()).error)
  })

  it("scores a deterministic-only rubric synchronously and snapshots the rubric", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id, { criteria: passingCriteria })
    const { run } = await createPromptRun(user.id)

    signInAs(user.clerkId)
    const res = await postEval(
      jsonRequest("POST", `/api/runs/${run.id}/eval`, { rubricId: rubric.id }),
      routeParams({ runId: run.id })
    )
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.status).toBe("complete")
    expect(data.evalMethod).toBe("deterministic")
    expect(data.totalScore).toBe(1)
    expect(data.passed).toBe(true)
    expect(data.criteriaSnapshot).toMatchObject({ rubricName: rubric.name, passThreshold: 0.7 })

    const stored = await prisma.evaluation.findUnique({ where: { id: data.id } })
    expect(stored?.userId).toBe(user.id)
    expect(stored?.completedAt).not.toBeNull()
  })

  it("computes the weighted total from partial matches", async () => {
    const user = await createUser()
    // exact hits (weight 60), contains "source" misses (weight 40) → 0.6, below 0.7
    const rubric = await createRubric(user.id, {
      criteria: [passingCriteria[0], validCriteria[1]],
    })
    const { run } = await createPromptRun(user.id)

    signInAs(user.clerkId)
    const { data } = await (
      await postEval(jsonRequest("POST", `/api/runs/${run.id}/eval`, { rubricId: rubric.id }), routeParams({ runId: run.id }))
    ).json()
    expect(data.totalScore).toBeCloseTo(0.6, 10)
    expect(data.passed).toBe(false)
  })

  it("queues a mixed rubric: 202, pending, deterministic scores precomputed", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id, {
      criteria: [
        passingCriteria[0],
        { name: "Judge quality", type: "ai_judge", weight: 50, config: { instructions: "Rate helpfulness" } },
      ],
    })
    const { run } = await createPromptRun(user.id)

    signInAs(user.clerkId)
    const res = await postEval(
      jsonRequest("POST", `/api/runs/${run.id}/eval`, { rubricId: rubric.id }),
      routeParams({ runId: run.id })
    )
    expect(res.status).toBe(202)
    const { data } = await res.json()
    expect(data.evalMethod).toBe("mixed")
    expect(data.totalScore).toBeNull()
    expect(data.criteriaScores).toHaveLength(1) // deterministic half already scored

    // after() is stubbed in the harness, so the queued job never runs, the
    // row must still be pending, exactly what a real client would poll.
    const stored = await prisma.evaluation.findUnique({ where: { id: data.id } })
    expect(stored?.status).toBe("pending")
  })

  it("marks a judge-only rubric ai_judge with no precomputed scores", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id, {
      criteria: [{ name: "Judge", type: "ai_judge", weight: 100, config: { instructions: "Rate it" } }],
    })
    const { run } = await createPromptRun(user.id)

    signInAs(user.clerkId)
    const res = await postEval(
      jsonRequest("POST", `/api/runs/${run.id}/eval`, { rubricId: rubric.id }),
      routeParams({ runId: run.id })
    )
    expect(res.status).toBe(202)
    const { data } = await res.json()
    expect(data.evalMethod).toBe("ai_judge")
    expect(data.criteriaScores).toEqual([])
  })
})

describe("GET /api/evals/:id", () => {
  it("returns 401 when signed out", async () => {
    const res = await getEval(jsonRequest("GET", "/api/evals/e1"), routeParams({ id: "e1" }))
    expect(res.status).toBe(401)
  })

  it("returns 404 for an unknown eval and 403 for another user's", async () => {
    const me = await createUser()
    const other = await createUser()
    const theirs = await createPromptRun(other.id)
    const theirEval = await createEvaluation(other.id, theirs.run.id)

    signInAs(me.clerkId)
    expect((await getEval(jsonRequest("GET", "/api/evals/nope"), routeParams({ id: "nope" }))).status).toBe(404)
    expect(
      (await getEval(jsonRequest("GET", `/api/evals/${theirEval.id}`), routeParams({ id: theirEval.id }))).status
    ).toBe(403)
  })

  it("returns the caller's evaluation", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    const evaluation = await createEvaluation(user.id, run.id)

    signInAs(user.clerkId)
    const res = await getEval(jsonRequest("GET", `/api/evals/${evaluation.id}`), routeParams({ id: evaluation.id }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.id).toBe(evaluation.id)
    expect(data.totalScore).toBe(0.9)
  })
})
