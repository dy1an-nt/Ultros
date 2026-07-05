import { describe, it, expect } from "vitest"
import { POST } from "@/app/api/prompts/[id]/regression/route"
import { GET as getHistory } from "@/app/api/prompts/[id]/regression/history/route"
import { POST as postBaseline } from "@/app/api/prompts/[id]/baseline/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createScoredDatasetRun } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

function launch(id: string, body: unknown) {
  return POST(jsonRequest("POST", `/api/prompts/${id}/regression`, body), routeParams({ id }))
}

function history(id: string) {
  return getHistory(jsonRequest("GET", `/api/prompts/${id}/regression/history`), routeParams({ id }))
}

// Scored baseline run (avgScore 0.75) blessed as the prompt's baseline, plus
// a v2 whose {{question}} still maps onto the dataset — ready to regress.
async function baselineFixtures(userId: string) {
  const f = await createScoredDatasetRun(userId)
  signInAs((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).clerkId)
  await postBaseline(
    jsonRequest("POST", `/api/prompts/${f.prompt.id}/baseline`, {
      promptVersionId: f.version.id,
      datasetRunId: f.datasetRun.id,
    }),
    routeParams({ id: f.prompt.id })
  )
  const v2 = await prisma.promptVersion.create({
    data: { promptId: f.prompt.id, versionNumber: 2, userPrompt: "Reworded: {{question}}" },
  })
  return { ...f, v2 }
}

describe("POST /api/prompts/:id/regression", () => {
  it("returns 401 when signed out", async () => {
    expect((await launch("x", {})).status).toBe(401)
  })

  it("returns 404 when the prompt has no baseline", async () => {
    const user = await createUser()
    const { prompt, version } = await createScoredDatasetRun(user.id)
    signInAs(user.clerkId)

    const res = await launch(prompt.id, { newVersionId: version.id })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain("set a baseline first")
  })

  it("rejects a version from a different prompt", async () => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)
    const other = await createScoredDatasetRun(user.id)

    const res = await launch(f.prompt.id, { newVersionId: other.version.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid newVersionId")
  })

  it.each([
    ["below the floor", 0.001],
    ["above the cap", 0.9],
    ["a string", "0.05"],
  ])("rejects threshold %s with 400", async (_label, threshold) => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)
    const res = await launch(f.prompt.id, { newVersionId: f.v2.id, threshold })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("threshold")
  })

  it("refuses to launch when the baseline's rubric was deleted", async () => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)
    await prisma.rubric.delete({ where: { id: f.rubric.id } })

    const res = await launch(f.prompt.id, { newVersionId: f.v2.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("rubric no longer exists")
  })

  it("rejects a new version whose template vars no longer map onto the dataset", async () => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)
    const v3 = await prisma.promptVersion.create({
      data: { promptId: f.prompt.id, versionNumber: 3, userPrompt: "Uses {{other_var}}" },
    })

    const res = await launch(f.prompt.id, { newVersionId: v3.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("unmapped template variables: other_var")
  })

  it("launches with 202: pending run pinned to the baseline's model/params, pending verdict row", async () => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)

    const res = await launch(f.prompt.id, { newVersionId: f.v2.id })
    expect(res.status).toBe(202)
    const { data } = await res.json()
    expect(data.baselineScore).toBe(0.75)

    const run = await prisma.datasetRun.findUniqueOrThrow({ where: { id: data.datasetRunId } })
    expect(run.status).toBe("pending") // fan-out stubbed
    expect(run.promptVersionId).toBe(f.v2.id)
    expect(run.model).toBe("claude-sonnet-5") // pinned — regression compares prompts, not models
    expect(run.rubricId).toBe(f.rubric.id)

    const verdict = await prisma.regressionRun.findUniqueOrThrow({ where: { id: data.regressionRunId } })
    expect(verdict.status).toBe("pending")
    expect(verdict.threshold).toBe(0.05) // default
    expect(verdict.datasetRunId).toBe(run.id)
  })
})

describe("GET /api/prompts/:id/regression/history", () => {
  it("returns 401 when signed out", async () => {
    expect((await history("x")).status).toBe(401)
  })

  it("returns 404 for another user's prompt", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const { prompt } = await createScoredDatasetRun(owner.id)

    signInAs(intruder.clerkId)
    expect((await history(prompt.id)).status).toBe(404)
  })

  it("returns an empty feed when no baseline is set", async () => {
    const user = await createUser()
    const { prompt } = await createScoredDatasetRun(user.id)
    signInAs(user.clerkId)

    const res = await history(prompt.id)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ baseline: null, runs: [] })
  })

  it("shows a just-launched run as pending with its version number", async () => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)
    await launch(f.prompt.id, { newVersionId: f.v2.id })

    const { data } = await (await history(f.prompt.id)).json()
    expect(data.baseline.baselineScore).toBe(0.75)
    expect(data.runs).toHaveLength(1)
    expect(data.runs[0]).toMatchObject({ status: "pending", versionNumber: 2, newScore: null })
  })

  it("lazily finalizes a pending verdict whose run went terminal — the lost-hook safety net", async () => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)
    const { data: launched } = await (await launch(f.prompt.id, { newVersionId: f.v2.id })).json()

    // The finalize hook never fired; the run itself finished below the bar.
    await prisma.datasetRun.update({
      where: { id: launched.datasetRunId },
      data: { status: "complete", completedRows: 2, avgScore: 0.6, passRate: 0.5 },
    })

    const { data } = await (await history(f.prompt.id)).json()
    expect(data.runs[0].status).toBe("complete")
    expect(data.runs[0].newScore).toBe(0.6)
    expect(data.runs[0].scoreDelta).toBeCloseTo(-0.15)
    expect(data.runs[0].regressed).toBe(true) // 0.6 < 0.75 - 0.05
    expect(data.runs[0].completedAt).not.toBeNull()
  })

  it("marks a verdict failed when its run finished without scores", async () => {
    const user = await createUser()
    const f = await baselineFixtures(user.id)
    const { data: launched } = await (await launch(f.prompt.id, { newVersionId: f.v2.id })).json()

    await prisma.datasetRun.update({
      where: { id: launched.datasetRunId },
      data: { status: "failed" },
    })

    const { data } = await (await history(f.prompt.id)).json()
    expect(data.runs[0].status).toBe("failed")
    expect(data.runs[0].regressed).toBeNull() // no fake verdict
  })
})
