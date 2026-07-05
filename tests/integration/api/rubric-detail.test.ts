import { describe, it, expect } from "vitest"
import { GET, PATCH, DELETE } from "@/app/api/rubrics/[id]/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createRubric, validCriteria } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

function get(id: string) {
  return GET(jsonRequest("GET", `/api/rubrics/${id}`), routeParams({ id }))
}

function patch(id: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/rubrics/${id}`, body), routeParams({ id }))
}

function del(id: string) {
  return DELETE(jsonRequest("DELETE", `/api/rubrics/${id}`), routeParams({ id }))
}

describe("GET /api/rubrics/:id", () => {
  it("returns 401 when signed out", async () => {
    expect((await get("x")).status).toBe(401)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    expect((await get("nope")).status).toBe(404)
  })

  it("returns 403 for another user's rubric", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const rubric = await createRubric(owner.id)

    signInAs(intruder.clerkId)
    expect((await get(rubric.id)).status).toBe(403)
  })

  it("returns the rubric", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id)
    signInAs(user.clerkId)

    const { data } = await (await get(rubric.id)).json()
    expect(data.id).toBe(rubric.id)
    expect(data.criteria).toEqual(validCriteria)
  })
})

describe("PATCH /api/rubrics/:id", () => {
  it("returns 403 for another user's rubric and writes nothing", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const rubric = await createRubric(owner.id)

    signInAs(intruder.clerkId)
    expect((await patch(rubric.id, { name: "hijacked" })).status).toBe(403)

    const stored = await prisma.rubric.findUnique({ where: { id: rubric.id } })
    expect(stored?.name).toBe("Test rubric")
  })

  it("rejects invalid replacement criteria with 400, leaving the original intact", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id)
    signInAs(user.clerkId)

    const res = await patch(rubric.id, { criteria: [] })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain("criteria")

    const stored = await prisma.rubric.findUnique({ where: { id: rubric.id } })
    expect(stored?.criteria).toEqual(validCriteria)
  })

  it("updates only the provided fields", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id)
    signInAs(user.clerkId)

    const res = await patch(rubric.id, { name: "Renamed", passThreshold: 0.9 })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.name).toBe("Renamed")
    expect(data.passThreshold).toBe(0.9)
    expect(data.criteria).toEqual(validCriteria) // untouched
  })

  it("replaces criteria wholesale", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id)
    signInAs(user.clerkId)

    const replacement = [
      { name: "Only one", type: "contains", weight: 100, config: { substring: "yes" } },
    ]
    const { data } = await (await patch(rubric.id, { criteria: replacement })).json()
    expect(data.criteria).toEqual(replacement)
  })
})

describe("DELETE /api/rubrics/:id", () => {
  it("returns 403 for another user's rubric and leaves it intact", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const rubric = await createRubric(owner.id)

    signInAs(intruder.clerkId)
    expect((await del(rubric.id)).status).toBe(403)
    expect(await prisma.rubric.findUnique({ where: { id: rubric.id } })).not.toBeNull()
  })

  it("deletes the rubric; subsequent GET and repeat DELETE are 404", async () => {
    const user = await createUser()
    const rubric = await createRubric(user.id)
    signInAs(user.clerkId)

    expect((await del(rubric.id)).status).toBe(200)
    expect(await prisma.rubric.findUnique({ where: { id: rubric.id } })).toBeNull()
    expect((await get(rubric.id)).status).toBe(404)
    expect((await del(rubric.id)).status).toBe(404)
  })
})
