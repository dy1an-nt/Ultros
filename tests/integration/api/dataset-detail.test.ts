import { describe, it, expect } from "vitest"
import { GET, DELETE } from "@/app/api/datasets/[id]/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createDataset, createDatasetRun } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

function get(id: string, query = "") {
  return GET(jsonRequest("GET", `/api/datasets/${id}${query}`), routeParams({ id }))
}

function del(id: string) {
  return DELETE(jsonRequest("DELETE", `/api/datasets/${id}`), routeParams({ id }))
}

describe("GET /api/datasets/:id", () => {
  it("returns 401 when signed out", async () => {
    expect((await get("x")).status).toBe(401)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    expect((await get("nope")).status).toBe(404)
  })

  it("returns 403 for another user's dataset", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const dataset = await createDataset(owner.id)

    signInAs(intruder.clerkId)
    expect((await get(dataset.id)).status).toBe(403)
  })

  it.each([
    ["negative offset", "?offset=-1"],
    ["zero limit", "?limit=0"],
    ["non-numeric limit", "?limit=abc"],
  ])("rejects %s with 400", async (_label, query) => {
    const user = await createUser()
    const dataset = await createDataset(user.id)
    signInAs(user.clerkId)
    expect((await get(dataset.id, query)).status).toBe(400)
  })

  it("returns the dataset with rows in rowIndex order", async () => {
    const user = await createUser()
    const dataset = await createDataset(user.id)
    signInAs(user.clerkId)

    const res = await get(dataset.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe("Test dataset")
    expect(data.rows.map((r: { rowIndex: number }) => r.rowIndex)).toEqual([0, 1])
    expect(data.rows[1].expectedOutput).toBe("Paris")
  })

  it("paginates rows with offset/limit", async () => {
    const user = await createUser()
    const dataset = await createDataset(user.id, {
      rows: [{ data: { q: "one" } }, { data: { q: "two" } }, { data: { q: "three" } }],
    })
    signInAs(user.clerkId)

    const { data } = await (await get(dataset.id, "?offset=1&limit=1")).json()
    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].data).toEqual({ q: "two" })
  })
})

describe("DELETE /api/datasets/:id", () => {
  it("returns 403 for another user's dataset and leaves it intact", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const dataset = await createDataset(owner.id)

    signInAs(intruder.clerkId)
    expect((await del(dataset.id)).status).toBe(403)
    expect(await prisma.dataset.findUnique({ where: { id: dataset.id } })).not.toBeNull()
  })

  it("returns 409 when the dataset has runs, keeping run history interpretable", async () => {
    const user = await createUser()
    const dataset = await createDataset(user.id)
    await createDatasetRun(user.id, dataset.id)

    signInAs(user.clerkId)
    const res = await del(dataset.id)
    expect(res.status).toBe(409)
    expect(await prisma.dataset.findUnique({ where: { id: dataset.id } })).not.toBeNull()
  })

  it("hard-deletes a run-free dataset along with its rows", async () => {
    const user = await createUser()
    const dataset = await createDataset(user.id)
    signInAs(user.clerkId)

    const res = await del(dataset.id)
    expect(res.status).toBe(200)
    expect(await prisma.dataset.findUnique({ where: { id: dataset.id } })).toBeNull()
    expect(await prisma.datasetRow.count({ where: { datasetId: dataset.id } })).toBe(0)
  })
})
