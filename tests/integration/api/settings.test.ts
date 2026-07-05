import { describe, it, expect } from "vitest"
import { GET, PATCH } from "@/app/api/settings/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser } from "../helpers/seed"
import { jsonRequest, rawRequest } from "../helpers/request"

function patch(body: unknown) {
  return PATCH(jsonRequest("PATCH", "/api/settings", body))
}

describe("GET /api/settings", () => {
  it("returns 401 when signed out", async () => {
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("defaults to no budget and zero spend", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await GET()
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.monthlyBudgetUsd).toBeNull()
    expect(data.monthSpendUsd).toBe(0)
  })

  it("sums only the current month's usage, and only the caller's", async () => {
    const me = await createUser()
    const other = await createUser()
    const now = new Date()
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
    await prisma.usageSummary.createMany({
      data: [
        { userId: me.id, date: thisMonth, totalCostUsd: 1.25 },
        { userId: me.id, date: lastMonth, totalCostUsd: 99 },
        { userId: other.id, date: thisMonth, totalCostUsd: 7 },
      ],
    })

    signInAs(me.clerkId)
    const { data } = await (await GET()).json()
    expect(data.monthSpendUsd).toBeCloseTo(1.25)
  })
})

describe("PATCH /api/settings", () => {
  it("returns 401 when signed out", async () => {
    const res = await patch({ monthlyBudgetUsd: 50 })
    expect(res.status).toBe(401)
  })

  it("rejects a malformed JSON body with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await PATCH(rawRequest("PATCH", "/api/settings", "{bad"))
    expect(res.status).toBe(400)
  })

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["over the cap", 100001],
    ["a string", "50"],
    // NaN is deliberately absent: JSON.stringify renders it as null, so the
    // Number.isFinite branch is unreachable through a real HTTP body.
    ["undefined (field omitted)", undefined],
  ])("rejects %s with 400", async (_label, value) => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await patch({ monthlyBudgetUsd: value })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("monthlyBudgetUsd")
  })

  it("sets, updates, and clears the budget", async () => {
    const user = await createUser()
    signInAs(user.clerkId)

    let { data } = await (await patch({ monthlyBudgetUsd: 50 })).json()
    expect(data.monthlyBudgetUsd).toBe(50)
    ;({ data } = await (await patch({ monthlyBudgetUsd: 75.5 })).json())
    expect(data.monthlyBudgetUsd).toBe(75.5)
    ;({ data } = await (await patch({ monthlyBudgetUsd: null })).json())
    expect(data.monthlyBudgetUsd).toBeNull()

    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } })
    expect(settings?.monthlyBudgetUsd).toBeNull()
  })
})
