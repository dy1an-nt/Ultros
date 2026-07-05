import { describe, it, expect } from "vitest"
import { GET, DELETE } from "@/app/api/share/[token]/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPromptRun, createEvaluation, createShare } from "../helpers/seed"
import { jsonRequest, routeParams } from "../helpers/request"

function get(token: string) {
  return GET(jsonRequest("GET", `/api/share/${token}`), routeParams({ token }))
}

function del(token: string) {
  return DELETE(jsonRequest("DELETE", `/api/share/${token}`), routeParams({ token }))
}

describe("GET /api/share/:token (public)", () => {
  it("resolves without auth and sets noindex/no-store headers", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    const share = await createShare(user.id, "promptRun", run.id)

    // no signInAs — this is the one deliberately public route
    const res = await get(share.token)
    expect(res.status).toBe(200)
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow")
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })

  it("exposes exactly the allowlisted promptRun fields — no ids, no owner", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    await createEvaluation(user.id, run.id)
    const share = await createShare(user.id, "promptRun", run.id)

    const { data } = await (await get(share.token)).json()
    expect(data.resourceType).toBe("promptRun")
    expect(Object.keys(data.resource).sort()).toEqual([
      "costUsd",
      "createdAt",
      "eval",
      "finishReason",
      "inputTokens",
      "latencyMs",
      "model",
      "outputTokens",
      "promptTitle",
      "responseText",
      "versionNumber",
    ])
    expect(data.resource.responseText).toBe("Hello, Ada!")
    // Eval summary is allowlisted too: per-criterion detail stays internal.
    expect(data.resource.eval).toEqual({
      totalScore: 0.9,
      passed: true,
      aiEvalReasoning: "Matched expectations.",
      criteria: [{ name: "Exact match", score: 0.9 }],
    })
  })

  it("returns byte-identical 404s for unknown and revoked tokens", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    const revoked = await createShare(user.id, "promptRun", run.id, { revokedAt: new Date() })

    const unknownRes = await get("no_such_token_ever_issued_000000")
    const revokedRes = await get(revoked.token)
    expect(unknownRes.status).toBe(404)
    expect(revokedRes.status).toBe(404)
    expect(await revokedRes.text()).toBe(await unknownRes.text())
  })

  it("returns 404 once the shared run's prompt is soft-deleted", async () => {
    const user = await createUser()
    const { prompt, run } = await createPromptRun(user.id)
    const share = await createShare(user.id, "promptRun", run.id)

    expect((await get(share.token)).status).toBe(200)
    await prisma.prompt.update({ where: { id: prompt.id }, data: { deletedAt: new Date() } })
    expect((await get(share.token)).status).toBe(404)
  })
})

describe("DELETE /api/share/:token (revoke)", () => {
  it("returns 401 when signed out", async () => {
    expect((await del("x")).status).toBe(401)
  })

  it("returns 404 (not 403) when revoking another user's share, leaving it live", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const { run } = await createPromptRun(owner.id)
    const share = await createShare(owner.id, "promptRun", run.id)

    signInAs(intruder.clerkId)
    expect((await del(share.token)).status).toBe(404)
    expect((await get(share.token)).status).toBe(200)
  })

  it("revokes immediately: public resolve 404s, repeat revoke 404s", async () => {
    const user = await createUser()
    const { run } = await createPromptRun(user.id)
    const share = await createShare(user.id, "promptRun", run.id)

    signInAs(user.clerkId)
    expect((await del(share.token)).status).toBe(200)
    expect((await get(share.token)).status).toBe(404)
    expect((await del(share.token)).status).toBe(404)

    const stored = await prisma.share.findUnique({ where: { token: share.token } })
    expect(stored?.revokedAt).toBeInstanceOf(Date)
  })
})
