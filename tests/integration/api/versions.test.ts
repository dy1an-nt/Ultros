import { describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/prompts/[id]/versions/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPrompt } from "../helpers/seed"
import { jsonRequest, rawRequest, routeParams } from "../helpers/request"

describe("GET /api/prompts/:id/versions", () => {
  it("returns 401 when signed out", async () => {
    const res = await GET(jsonRequest("GET", "/api/prompts/x/versions"), routeParams({ id: "x" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 for another user's prompt", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const prompt = await createPrompt(owner.id)

    signInAs(intruder.clerkId)
    const res = await GET(jsonRequest("GET", `/api/prompts/${prompt.id}/versions`), routeParams({ id: prompt.id }))
    expect(res.status).toBe(403)
  })

  it("lists versions newest-first", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id)
    await prisma.promptVersion.createMany({
      data: [
        { promptId: prompt.id, versionNumber: 2, userPrompt: "v2" },
        { promptId: prompt.id, versionNumber: 3, userPrompt: "v3" },
      ],
    })

    signInAs(user.clerkId)
    const res = await GET(jsonRequest("GET", `/api/prompts/${prompt.id}/versions`), routeParams({ id: prompt.id }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([3, 2, 1])
  })
})

describe("POST /api/prompts/:id/versions", () => {
  it("returns 401 when signed out", async () => {
    const res = await POST(
      jsonRequest("POST", "/api/prompts/x/versions", { userPrompt: "y" }),
      routeParams({ id: "x" })
    )
    expect(res.status).toBe(401)
  })

  it("returns 404 for an unknown prompt", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(
      jsonRequest("POST", "/api/prompts/nope/versions", { userPrompt: "y" }),
      routeParams({ id: "nope" })
    )
    expect(res.status).toBe(404)
  })

  it("returns 403 for another user's prompt and writes nothing", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const prompt = await createPrompt(owner.id)

    signInAs(intruder.clerkId)
    const res = await POST(
      jsonRequest("POST", `/api/prompts/${prompt.id}/versions`, { userPrompt: "sneaky" }),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(403)
    expect(await prisma.promptVersion.count({ where: { promptId: prompt.id } })).toBe(1)
  })

  it("rejects a malformed JSON body with 400 instead of crashing", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id)
    signInAs(user.clerkId)
    const res = await POST(
      rawRequest("POST", `/api/prompts/${prompt.id}/versions`, "{oops"),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("Request body is not valid JSON")
  })

  it("rejects a missing userPrompt with 400", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id)
    signInAs(user.clerkId)
    const res = await POST(
      jsonRequest("POST", `/api/prompts/${prompt.id}/versions`, { systemPrompt: "only system" }),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("userPrompt is required")
  })

  it("increments versionNumber and applies defaults", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id) // seeds version 1
    signInAs(user.clerkId)

    const res = await POST(
      jsonRequest("POST", `/api/prompts/${prompt.id}/versions`, { userPrompt: "second draft" }),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.versionNumber).toBe(2)
    expect(data.systemPrompt).toBe("")
    expect(data.variables).toEqual({})
    expect(data.label).toBeNull()
  })
})
