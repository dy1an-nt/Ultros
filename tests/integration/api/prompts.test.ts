import { describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/prompts/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPrompt } from "../helpers/seed"
import { jsonRequest, rawRequest } from "../helpers/request"

describe("GET /api/prompts", () => {
  it("returns 401 when signed out", async () => {
    const res = await GET()
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toEqual({ data: null, error: { code: "UNAUTHORIZED", message: "Authentication required" } })
  })

  it("returns 404 when the Clerk user has no DB row (webhook not yet synced)", async () => {
    signInAs("clerk_never_synced")
    const res = await GET()
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe("User not found")
  })

  it("returns an empty list for a user with no prompts", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [], error: null })
  })

  it("returns only the caller's non-deleted prompts", async () => {
    const me = await createUser()
    const other = await createUser()
    const mine = await createPrompt(me.id, { title: "Mine" })
    await createPrompt(me.id, { title: "Deleted", deletedAt: new Date() })
    await createPrompt(other.id, { title: "Someone else's" })

    signInAs(me.clerkId)
    const res = await GET()
    const { data } = await res.json()

    expect(data).toHaveLength(1)
    expect(data[0].id).toBe(mine.id)
    expect(data[0]._count).toEqual({ versions: 1, runs: 0 })
  })
})

describe("POST /api/prompts", () => {
  it("returns 401 when signed out", async () => {
    const res = await POST(jsonRequest("POST", "/api/prompts", { title: "x", userPrompt: "y" }))
    expect(res.status).toBe(401)
  })

  it("rejects a missing title with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(jsonRequest("POST", "/api/prompts", { userPrompt: "y" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("title is required")
  })

  it("rejects a whitespace-only userPrompt with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(jsonRequest("POST", "/api/prompts", { title: "x", userPrompt: "   " }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("userPrompt is required")
  })

  it("rejects a malformed JSON body with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(rawRequest("POST", "/api/prompts", "{not json"))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("Request body is not valid JSON")
  })

  it("creates the prompt with an initial version 1", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(
      jsonRequest("POST", "/api/prompts", {
        title: "  Summarizer  ",
        description: "Summarizes things",
        tags: ["nlp"],
        systemPrompt: "Be brief.",
        userPrompt: "Summarize: {{text}}",
      })
    )
    expect(res.status).toBe(201)
    const { data, error } = await res.json()
    expect(error).toBeNull()
    expect(data.title).toBe("Summarizer") // trimmed
    expect(data.versions).toEqual([{ id: expect.any(String), versionNumber: 1 }])

    const version = await prisma.promptVersion.findUnique({
      where: { promptId_versionNumber: { promptId: data.id, versionNumber: 1 } },
    })
    expect(version?.userPrompt).toBe("Summarize: {{text}}")
    expect(version?.systemPrompt).toBe("Be brief.")

    const stored = await prisma.prompt.findUnique({ where: { id: data.id } })
    expect(stored?.userId).toBe(user.id)
  })
})
