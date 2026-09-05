import { describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/rubrics/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createRubric, validCriteria } from "../helpers/seed"
import { jsonRequest, rawRequest } from "../helpers/request"

describe("GET /api/rubrics", () => {
  it("returns 401 when signed out", async () => {
    expect((await GET(jsonRequest("GET", "/api/rubrics"))).status).toBe(401)
  })

  it("returns only the caller's rubrics", async () => {
    const me = await createUser()
    const other = await createUser()
    const mine = await createRubric(me.id, { name: "Mine" })
    await createRubric(other.id, { name: "Theirs" })

    signInAs(me.clerkId)
    const { data } = await (await GET(jsonRequest("GET", "/api/rubrics"))).json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe(mine.id)
  })
})

describe("POST /api/rubrics", () => {
  const valid = { name: "Quality", passThreshold: 0.7, criteria: validCriteria }

  it("returns 401 when signed out", async () => {
    expect((await POST(jsonRequest("POST", "/api/rubrics", valid))).status).toBe(401)
  })

  it("rejects a malformed JSON body with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(rawRequest("POST", "/api/rubrics", "{bad"))
    expect(res.status).toBe(400)
  })

  it("rejects a whitespace-only name with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(jsonRequest("POST", "/api/rubrics", { ...valid, name: "   " }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain("name")
  })

  it.each([
    ["negative", -0.1],
    ["above 1", 1.5],
    ["a string", "0.7"],
  ])("rejects passThreshold %s with 400", async (_label, passThreshold) => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(jsonRequest("POST", "/api/rubrics", { ...valid, passThreshold }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain("passThreshold")
  })

  it("rejects invalid criteria with a field-specific 400 and persists nothing", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(
      jsonRequest("POST", "/api/rubrics", {
        ...valid,
        criteria: [{ name: "Bad regex", type: "regex", weight: 100, config: { pattern: "(" } }],
      })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("criteria[0].config.pattern: invalid regex")
    expect(await prisma.rubric.count()).toBe(0)
  })

  it("creates the rubric with trimmed name and validated criteria", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(jsonRequest("POST", "/api/rubrics", { ...valid, name: "  Quality  " }))
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.name).toBe("Quality")
    expect(data.passThreshold).toBe(0.7)
    expect(data.criteria).toEqual(validCriteria)

    const stored = await prisma.rubric.findUnique({ where: { id: data.id } })
    expect(stored?.userId).toBe(user.id)
  })
})
