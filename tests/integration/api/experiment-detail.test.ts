import { describe, it, expect } from "vitest"
import { GET } from "@/app/api/experiments/[id]/route"
import { GET as getResults } from "@/app/api/experiments/[id]/results/route"
import { GET as getRows } from "@/app/api/experiments/[id]/rows/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createExperiment, createScoredDatasetRun } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

function get(id: string) {
  return GET(jsonRequest("GET", `/api/experiments/${id}`), routeParams({ id }))
}

function results(id: string) {
  return getResults(jsonRequest("GET", `/api/experiments/${id}/results`), routeParams({ id }))
}

function rows(id: string, query: string) {
  return getRows(jsonRequest("GET", `/api/experiments/${id}/rows${query}`), routeParams({ id }))
}

describe("GET /api/experiments/:id", () => {
  it("returns 401 when signed out", async () => {
    expect((await get("x")).status).toBe(401)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    expect((await get("nope")).status).toBe(404)
  })

  it("returns 403 for another user's experiment", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const { experiment } = await createExperiment(owner.id)

    signInAs(intruder.clerkId)
    expect((await get(experiment.id)).status).toBe(403)
  })

  it("returns the experiment with its cells and variant versions", async () => {
    const user = await createUser()
    const { experiment, v1 } = await createExperiment(user.id)
    const { datasetRun } = await createScoredDatasetRun(user.id)
    await prisma.datasetRun.update({
      where: { id: datasetRun.id },
      data: { experimentId: experiment.id },
    })

    signInAs(user.clerkId)
    const res = await get(experiment.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe("A/B test")
    expect(data.cells).toHaveLength(1)
    expect(data.cells[0]).toMatchObject({
      datasetRunId: datasetRun.id,
      status: "complete",
      totalRows: 2,
      completedRows: 2,
    })
    expect(data.versions.map((v: { versionNumber: number }) => v.versionNumber).sort()).toEqual([1, 2])
    expect(data.versions.find((v: { id: string }) => v.id === v1.id)).toBeTruthy()
  })
})

describe("GET /api/experiments/:id/results", () => {
  it("returns 403 for another user's experiment", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const { experiment } = await createExperiment(owner.id)

    signInAs(intruder.clerkId)
    expect((await results(experiment.id)).status).toBe(403)
  })

  it("returns per-cell results and a win matrix built from scored pairs only", async () => {
    const user = await createUser()
    const { experiment } = await createExperiment(user.id)

    signInAs(user.clerkId)
    const res = await results(experiment.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.results).toHaveLength(4)
    // model-b's variant-1 cell has null avgScore, so only the model-a pair remains
    expect(data.winMatrix).toHaveLength(1)
    expect(data.winMatrix[0].model).toBe("model-a")
    expect(data.winMatrix[0].meanDiff).toBeCloseTo(0.2)
    // no complete evaluations seeded for these cells
    expect(data.criterionStats).toEqual([])
  })
})

describe("GET /api/experiments/:id/rows", () => {
  it("requires the cell query param", async () => {
    const user = await createUser()
    const { experiment } = await createExperiment(user.id)
    signInAs(user.clerkId)

    const res = await rows(experiment.id, "")
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("cell query param is required")
  })

  it("rejects a cell that belongs to a different (or no) experiment", async () => {
    const user = await createUser()
    const { experiment } = await createExperiment(user.id)
    const { datasetRun } = await createScoredDatasetRun(user.id) // experimentId null
    signInAs(user.clerkId)

    const res = await rows(experiment.id, `?cell=${datasetRun.id}`)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid cell")
  })

  it("rejects bad pagination with 400", async () => {
    const user = await createUser()
    const { experiment } = await createExperiment(user.id)
    const { datasetRun } = await createScoredDatasetRun(user.id)
    await prisma.datasetRun.update({
      where: { id: datasetRun.id },
      data: { experimentId: experiment.id },
    })
    signInAs(user.clerkId)

    expect((await rows(experiment.id, `?cell=${datasetRun.id}&offset=-1`)).status).toBe(400)
  })

  it("returns the cell's rows in rowIndex order with their latest eval", async () => {
    const user = await createUser()
    const { experiment } = await createExperiment(user.id)
    const { datasetRun } = await createScoredDatasetRun(user.id)
    await prisma.datasetRun.update({
      where: { id: datasetRun.id },
      data: { experimentId: experiment.id },
    })
    signInAs(user.clerkId)

    const res = await rows(experiment.id, `?cell=${datasetRun.id}`)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.total).toBe(2)
    expect(data.rows.map((r: { rowIndex: number }) => r.rowIndex)).toEqual([0, 1])
    expect(data.rows[0].eval.totalScore).toBe(0.9)
    // unlike the public share view, the drill-down surfaces in-flight evals
    expect(data.rows[1].eval.status).toBe("pending")
  })
})
