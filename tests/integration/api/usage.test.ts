import { describe, it, expect } from "vitest"
import { GET as getUsage } from "@/app/api/usage/route"
import { GET as getExport } from "@/app/api/usage/export/route"
import { signInAs } from "../helpers/clerk"
import { createUser, createUsage } from "../helpers/seed"
import { jsonRequest } from "../helpers/request"

function isoDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().split("T")[0]
}

describe("GET /api/usage", () => {
  it("returns 401 when signed out", async () => {
    const res = await getUsage(jsonRequest("GET", "/api/usage"))
    expect(res.status).toBe(401)
  })

  it.each([
    ["zero", "0"],
    ["negative", "-5"],
    ["above 90", "91"],
    ["not a number", "abc"],
  ])("rejects days=%s with 400", async (_label, days) => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await getUsage(jsonRequest("GET", `/api/usage?days=${days}`))
    expect(res.status).toBe(400)
  })

  it("aggregates only the caller's rows inside the window", async () => {
    const me = await createUser()
    const other = await createUser()
    await createUsage(me.id, 0, { totalRuns: 2, totalInputTokens: 10, totalOutputTokens: 20, totalCostUsd: 0.5 })
    await createUsage(me.id, 5, { totalRuns: 3, totalInputTokens: 30, totalOutputTokens: 60, totalCostUsd: 0.25 })
    await createUsage(me.id, 40, { totalRuns: 7 }) // outside the default 30-day window
    await createUsage(other.id, 0, { totalRuns: 100 }) // someone else's usage

    signInAs(me.clerkId)
    const { data } = await (await getUsage(jsonRequest("GET", "/api/usage"))).json()

    expect(data.summary).toEqual({
      totalRuns: 5,
      totalInputTokens: 40,
      totalOutputTokens: 80,
      totalCostUsd: 0.75,
    })
    // daily rows newest-first, dates serialized as YYYY-MM-DD
    expect(data.daily.map((d: { date: string }) => d.date)).toEqual([isoDaysAgo(0), isoDaysAgo(5)])
  })

  it("days=1 means today only", async () => {
    const user = await createUser()
    await createUsage(user.id, 0, { totalRuns: 2 })
    await createUsage(user.id, 1, { totalRuns: 9 }) // yesterday

    signInAs(user.clerkId)
    const { data } = await (await getUsage(jsonRequest("GET", "/api/usage?days=1"))).json()
    expect(data.summary.totalRuns).toBe(2)
    expect(data.daily).toHaveLength(1)
  })

  it("returns zeroed summary and empty daily when there is no usage", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const { data } = await (await getUsage(jsonRequest("GET", "/api/usage"))).json()
    expect(data.summary).toEqual({ totalRuns: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0 })
    expect(data.daily).toEqual([])
  })
})

describe("GET /api/usage/export", () => {
  it("returns 401 when signed out", async () => {
    const res = await getExport(jsonRequest("GET", "/api/usage/export"))
    expect(res.status).toBe(401)
  })

  it.each([
    ["from", "?from=2026-1-1"],
    ["to", "?to=07-05-2026"],
    ["from", "?from=notadate"],
  ])("rejects a malformed %s with 400", async (_field, query) => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await getExport(jsonRequest("GET", `/api/usage/export${query}`))
    expect(res.status).toBe(400)
  })

  it("exports the caller's rows as CSV, oldest first, with headers and attachment disposition", async () => {
    const me = await createUser()
    const other = await createUser()
    await createUsage(me.id, 1, { totalRuns: 3, totalInputTokens: 30, totalOutputTokens: 60, totalCostUsd: 0.25 })
    await createUsage(me.id, 0, { totalRuns: 2, totalInputTokens: 10, totalOutputTokens: 20, totalCostUsd: 0.5 })
    await createUsage(other.id, 0, { totalRuns: 99 })

    signInAs(me.clerkId)
    const res = await getExport(jsonRequest("GET", "/api/usage/export"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toContain("ultros-usage.csv")

    const lines = (await res.text()).trim().split("\n")
    expect(lines[0]).toBe("date,runs,inputTokens,outputTokens,costUsd")
    expect(lines).toHaveLength(3) // header + my two rows, never the other user's
    expect(lines[1]).toBe(`"${isoDaysAgo(1)}",3,30,60,0.250000`)
    expect(lines[2]).toBe(`"${isoDaysAgo(0)}",2,10,20,0.500000`)
  })

  it("applies from/to bounds inclusively", async () => {
    const user = await createUser()
    await createUsage(user.id, 0, { totalRuns: 1 })
    await createUsage(user.id, 2, { totalRuns: 2 })
    await createUsage(user.id, 4, { totalRuns: 3 })

    signInAs(user.clerkId)
    const res = await getExport(
      jsonRequest("GET", `/api/usage/export?from=${isoDaysAgo(2)}&to=${isoDaysAgo(2)}`)
    )
    const lines = (await res.text()).trim().split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(isoDaysAgo(2))
  })

  it("returns just the header when there is no usage", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await getExport(jsonRequest("GET", "/api/usage/export"))
    expect((await res.text()).trim()).toBe("date,runs,inputTokens,outputTokens,costUsd")
  })
})
