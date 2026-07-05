import { describe, it, expect } from "vitest"
import { GET, POST, DELETE } from "@/app/api/prompts/[id]/baseline/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createScoredDatasetRun } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

function get(id: string) {
  return GET(jsonRequest("GET", `/api/prompts/${id}/baseline`), routeParams({ id }))
}

function post(id: string, body: unknown) {
  return POST(jsonRequest("POST", `/api/prompts/${id}/baseline`, body), routeParams({ id }))
}

function del(id: string) {
  return DELETE(jsonRequest("DELETE", `/api/prompts/${id}/baseline`), routeParams({ id }))
}

describe("GET /api/prompts/:id/baseline", () => {
  it("returns 401 when signed out", async () => {
    expect((await get("x")).status).toBe(401)
  })

  it("returns 404 (not 403) for another user's prompt", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const { prompt } = await createScoredDatasetRun(owner.id)

    signInAs(intruder.clerkId)
    expect((await get(prompt.id)).status).toBe(404)
  })

  it("returns 404 when no baseline is set", async () => {
    const user = await createUser()
    const { prompt } = await createScoredDatasetRun(user.id)
    signInAs(user.clerkId)

    const res = await get(prompt.id)
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe("no baseline set for this prompt")
  })
})

describe("POST /api/prompts/:id/baseline", () => {
  it("returns 401 when signed out", async () => {
    expect((await post("x", {})).status).toBe(401)
  })

  it("rejects a version belonging to a different prompt", async () => {
    const user = await createUser()
    const mine = await createScoredDatasetRun(user.id)
    const otherPrompt = await createScoredDatasetRun(user.id)

    signInAs(user.clerkId)
    const res = await post(mine.prompt.id, {
      promptVersionId: otherPrompt.version.id,
      datasetRunId: mine.datasetRun.id,
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("invalid promptVersionId")
  })

  it("rejects another user's dataset run as 'invalid datasetRunId'", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const theirs = await createScoredDatasetRun(owner.id)
    const mine = await createScoredDatasetRun(intruder.id)

    signInAs(intruder.clerkId)
    const res = await post(mine.prompt.id, {
      promptVersionId: mine.version.id,
      datasetRunId: theirs.datasetRun.id,
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("invalid datasetRunId")
  })

  it("rejects a run of a different version of the prompt", async () => {
    const user = await createUser()
    const f = await createScoredDatasetRun(user.id)
    const v2 = await prisma.promptVersion.create({
      data: { promptId: f.prompt.id, versionNumber: 2, userPrompt: "v2" },
    })

    signInAs(user.clerkId)
    const res = await post(f.prompt.id, { promptVersionId: v2.id, datasetRunId: f.datasetRun.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("datasetRunId does not belong to the given promptVersionId")
  })

  it("rejects a run that is still in flight", async () => {
    const user = await createUser()
    const f = await createScoredDatasetRun(user.id)
    await prisma.datasetRun.update({ where: { id: f.datasetRun.id }, data: { status: "running" } })

    signInAs(user.clerkId)
    const res = await post(f.prompt.id, { promptVersionId: f.version.id, datasetRunId: f.datasetRun.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("baseline run must be complete")
  })

  it("rejects an unscored run", async () => {
    const user = await createUser()
    const f = await createScoredDatasetRun(user.id)
    await prisma.datasetRun.update({ where: { id: f.datasetRun.id }, data: { rubricId: null } })

    signInAs(user.clerkId)
    const res = await post(f.prompt.id, { promptVersionId: f.version.id, datasetRunId: f.datasetRun.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("baseline run must be scored against a rubric")
  })

  it("pins the baseline to the run's blessed numbers, resolvable via GET", async () => {
    const user = await createUser()
    const f = await createScoredDatasetRun(user.id)
    signInAs(user.clerkId)

    const res = await post(f.prompt.id, { promptVersionId: f.version.id, datasetRunId: f.datasetRun.id })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data).toMatchObject({
      versionNumber: 1,
      datasetName: "QA pairs",
      rubricName: "Test rubric",
      model: "claude-sonnet-5",
      baselineScore: 0.75,
      baselinePassRate: 0.5,
    })

    const fetched = await (await get(f.prompt.id)).json()
    expect(fetched.data.id).toBe(data.id)
  })

  it("re-POST replaces the prompt's single baseline in place", async () => {
    const user = await createUser()
    const f = await createScoredDatasetRun(user.id)
    signInAs(user.clerkId)
    const first = await (await post(f.prompt.id, { promptVersionId: f.version.id, datasetRunId: f.datasetRun.id })).json()

    // a second complete scored run of a new version of the same prompt
    const v2 = await prisma.promptVersion.create({
      data: { promptId: f.prompt.id, versionNumber: 2, userPrompt: "v2" },
    })
    const run2 = await prisma.datasetRun.create({
      data: {
        userId: user.id,
        datasetId: f.dataset.id,
        promptVersionId: v2.id,
        rubricId: f.rubric.id,
        model: "claude-sonnet-5",
        temperature: 0,
        maxTokens: 256,
        variableMapping: { question: "question" },
        status: "complete",
        totalRows: 2,
        avgScore: 0.9,
        passRate: 1,
      },
    })

    const res = await post(f.prompt.id, { promptVersionId: v2.id, datasetRunId: run2.id })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.id).toBe(first.data.id) // same row, new anchor
    expect(data.versionNumber).toBe(2)
    expect(data.baselineScore).toBe(0.9)
    expect(await prisma.baseline.count({ where: { promptId: f.prompt.id } })).toBe(1)
  })
})

describe("DELETE /api/prompts/:id/baseline", () => {
  it("returns 404 when no baseline is set", async () => {
    const user = await createUser()
    const { prompt } = await createScoredDatasetRun(user.id)
    signInAs(user.clerkId)
    expect((await del(prompt.id)).status).toBe(404)
  })

  it("deletes the baseline and cascades its regression history", async () => {
    const user = await createUser()
    const f = await createScoredDatasetRun(user.id)
    signInAs(user.clerkId)
    await post(f.prompt.id, { promptVersionId: f.version.id, datasetRunId: f.datasetRun.id })
    const baseline = await prisma.baseline.findUniqueOrThrow({ where: { promptId: f.prompt.id } })
    await prisma.regressionRun.create({
      data: {
        baselineId: baseline.id,
        userId: user.id,
        newVersionId: f.version.id,
        datasetRunId: f.datasetRun.id,
        status: "complete",
        threshold: 0.05,
        regressedRowIds: [],
      },
    })

    expect((await del(f.prompt.id)).status).toBe(200)
    expect(await prisma.baseline.count()).toBe(0)
    expect(await prisma.regressionRun.count()).toBe(0) // meaningless without its anchor
  })
})
