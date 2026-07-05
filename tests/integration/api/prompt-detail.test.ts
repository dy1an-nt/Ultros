import { describe, it, expect } from "vitest"
import { GET, PATCH, DELETE } from "@/app/api/prompts/[id]/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPrompt } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

function get(id: string) {
  return GET(jsonRequest("GET", `/api/prompts/${id}`), routeParams({ id }))
}

describe("GET /api/prompts/:id", () => {
  it("returns 401 when signed out", async () => {
    const res = await get("anything")
    expect(res.status).toBe(401)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await get("nonexistent")
    expect(res.status).toBe(404)
  })

  it("returns 404 for a soft-deleted prompt", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id, { deletedAt: new Date() })
    signInAs(user.clerkId)
    const res = await get(prompt.id)
    expect(res.status).toBe(404)
  })

  it("returns 403 for another user's prompt (no existence leak beyond status)", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const prompt = await createPrompt(owner.id)

    signInAs(intruder.clerkId)
    const res = await get(prompt.id)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ data: null, error: { code: "FORBIDDEN", message: "You do not have access to this resource" } })
  })

  it("returns the prompt with versions newest-first", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id)
    await prisma.promptVersion.create({
      data: { promptId: prompt.id, versionNumber: 2, userPrompt: "v2" },
    })

    signInAs(user.clerkId)
    const res = await get(prompt.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([2, 1])
    expect(data._count.runs).toBe(0)
  })
})

describe("PATCH /api/prompts/:id", () => {
  it("returns 403 for another user's prompt", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const prompt = await createPrompt(owner.id)

    signInAs(intruder.clerkId)
    const res = await PATCH(
      jsonRequest("PATCH", `/api/prompts/${prompt.id}`, { title: "hijacked" }),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(403)

    const stored = await prisma.prompt.findUnique({ where: { id: prompt.id } })
    expect(stored?.title).toBe("Test prompt")
  })

  it("rejects an empty title with 400", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id)
    signInAs(user.clerkId)
    const res = await PATCH(
      jsonRequest("PATCH", `/api/prompts/${prompt.id}`, { title: "   " }),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(400)
  })

  it("rejects non-string tags with 400", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id)
    signInAs(user.clerkId)
    const res = await PATCH(
      jsonRequest("PATCH", `/api/prompts/${prompt.id}`, { tags: ["ok", 3] }),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(400)
  })

  it("updates only the provided fields", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id, { title: "Before" })
    signInAs(user.clerkId)
    const res = await PATCH(
      jsonRequest("PATCH", `/api/prompts/${prompt.id}`, { tags: ["a", "b"] }),
      routeParams({ id: prompt.id })
    )
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.title).toBe("Before")
    expect(data.tags).toEqual(["a", "b"])
  })
})

describe("DELETE /api/prompts/:id", () => {
  it("returns 403 for another user's prompt and leaves it intact", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const prompt = await createPrompt(owner.id)

    signInAs(intruder.clerkId)
    const res = await DELETE(jsonRequest("DELETE", `/api/prompts/${prompt.id}`), routeParams({ id: prompt.id }))
    expect(res.status).toBe(403)

    const stored = await prisma.prompt.findUnique({ where: { id: prompt.id } })
    expect(stored?.deletedAt).toBeNull()
  })

  it("soft-deletes: row survives, subsequent GET and repeat DELETE are 404", async () => {
    const user = await createUser()
    const prompt = await createPrompt(user.id)
    signInAs(user.clerkId)

    const res = await DELETE(jsonRequest("DELETE", `/api/prompts/${prompt.id}`), routeParams({ id: prompt.id }))
    expect(res.status).toBe(200)

    const stored = await prisma.prompt.findUnique({ where: { id: prompt.id } })
    expect(stored?.deletedAt).toBeInstanceOf(Date)

    expect((await get(prompt.id)).status).toBe(404)
    const again = await DELETE(jsonRequest("DELETE", `/api/prompts/${prompt.id}`), routeParams({ id: prompt.id }))
    expect(again.status).toBe(404)
  })
})
