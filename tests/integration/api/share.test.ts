import { describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/share/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPromptRun, createShare } from "../helpers/seed"
import { jsonRequest } from "../helpers/request"

function post(body: unknown) {
  return POST(jsonRequest("POST", "/api/share", body))
}

describe("GET /api/share", () => {
  it("returns 401 when signed out", async () => {
    expect((await GET()).status).toBe(401)
  })

  it("lists only the caller's live shares", async () => {
    const me = await createUser()
    const other = await createUser()
    const mine = await createPromptRun(me.id)
    const revoked = await createPromptRun(me.id)
    const theirs = await createPromptRun(other.id)
    const live = await createShare(me.id, "promptRun", mine.run.id)
    await createShare(me.id, "promptRun", revoked.run.id, { revokedAt: new Date() })
    await createShare(other.id, "promptRun", theirs.run.id)

    signInAs(me.clerkId)
    const { data } = await (await GET()).json()
    expect(data).toHaveLength(1)
    expect(data[0].token).toBe(live.token)
    expect(data[0].url).toContain(`/share/${live.token}`)
  })
})

describe("POST /api/share", () => {
  it("returns 401 when signed out", async () => {
    expect((await post({ resourceType: "promptRun", resourceId: "x" })).status).toBe(401)
  })

  it("rejects an unknown resourceType with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await post({ resourceType: "rubric", resourceId: "x" })
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain("resourceType")
  })

  it("rejects a missing resourceId with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    expect((await post({ resourceType: "promptRun" })).status).toBe(400)
  })

  it("returns 404 for a nonexistent resource", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    expect((await post({ resourceType: "promptRun", resourceId: "ghost" })).status).toBe(404)
  })

  it("returns 404 (not 403) for another user's resource — same as nonexistent", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const { run } = await createPromptRun(owner.id)

    signInAs(intruder.clerkId)
    const res = await post({ resourceType: "promptRun", resourceId: run.id })
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe("Resource not found")
    expect(await prisma.share.count()).toBe(0)
  })

  it("returns 404 for a run whose prompt was soft-deleted", async () => {
    const user = await createUser()
    const { prompt, run } = await createPromptRun(user.id)
    await prisma.prompt.update({ where: { id: prompt.id }, data: { deletedAt: new Date() } })

    signInAs(user.clerkId)
    expect((await post({ resourceType: "promptRun", resourceId: run.id })).status).toBe(404)
  })

  it("creates a share with 201 and a capability URL", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    signInAs(user.clerkId)

    const res = await post({ resourceType: "promptRun", resourceId: run.id })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.token).toHaveLength(32)
    expect(data.url).toContain(`/share/${data.token}`)
  })

  it("is idempotent per resource: re-POST returns the existing live token with 200", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    signInAs(user.clerkId)

    const first = await (await post({ resourceType: "promptRun", resourceId: run.id })).json()
    const second = await post({ resourceType: "promptRun", resourceId: run.id })
    expect(second.status).toBe(200)
    expect((await second.json()).data.token).toBe(first.data.token)
    expect(await prisma.share.count()).toBe(1)
  })

  it("re-sharing a revoked resource mints a NEW token — the old URL stays dead", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    const revoked = await createShare(user.id, "promptRun", run.id, { revokedAt: new Date() })

    signInAs(user.clerkId)
    const res = await post({ resourceType: "promptRun", resourceId: run.id })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.token).not.toBe(revoked.token)

    // Same row, reissued — not a second share for the resource.
    const shares = await prisma.share.findMany({ where: { userId: user.id } })
    expect(shares).toHaveLength(1)
    expect(shares[0].revokedAt).toBeNull()
  })
})
