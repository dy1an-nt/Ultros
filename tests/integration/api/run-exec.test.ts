import { describe, it, expect, vi, beforeEach } from "vitest"
import type { RunParams } from "@/lib/ai"
import { calculateCost } from "@/lib/ai/pricing"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createPrompt } from "../helpers/seed"
import { jsonRequest, rawRequest } from "../helpers/request"

// The execution routes are the only ones whose behavior spans a live provider
// stream. The stub below stands in for lib/ai's runStream at the exact seam
// the routes consume, everything else (validation, interpolation, pricing,
// persistence, the ndjson protocol) runs for real.
const stub = {
  chunks: ["Hello ", "world"],
  usage: { inputTokens: 12, outputTokens: 34 },
  finishReason: "stop",
  failFor: new Set<string>(),
}
const runStreamCalls: RunParams[] = []

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>()
  return {
    ...actual,
    runStream: (params: RunParams) => {
      runStreamCalls.push(params)
      if (stub.failFor.has(params.model)) throw new Error(`provider exploded: ${params.model}`)
      const text = stub.chunks.join("")
      for (const c of stub.chunks) params.onTextDelta?.(c)
      return {
        textStream: (async function* () {
          for (const c of stub.chunks) yield c
        })(),
        usage: Promise.resolve(stub.usage),
        text: Promise.resolve(text),
        finishReason: Promise.resolve(stub.finishReason),
        toTextStreamResponse: () => new Response(text, { headers: { "Content-Type": "text/plain" } }),
      }
    },
  }
})

// /api/run persists through next/server's after(); the global harness stub
// no-ops it. Capture callbacks here instead so each test flushes deliberately
// the same "response first, persistence after" order production has.
const afterCallbacks: Array<() => unknown> = []
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return { ...actual, after: (cb: () => unknown) => void afterCallbacks.push(cb) }
})

async function flushAfter() {
  while (afterCallbacks.length) await afterCallbacks.shift()!()
}

// Anthropic ids: the harness sets only ANTHROPIC_API_KEY, so other providers
// are legitimately unavailable, that's an assertion below, not a limitation.
const MODEL_A = "claude-sonnet-4-6"
const MODEL_B = "claude-haiku-4-5"

const { POST: postRun } = await import("@/app/api/run/route")
const { POST: postCompare } = await import("@/app/api/compare/route")

beforeEach(() => {
  stub.chunks = ["Hello ", "world"]
  stub.usage = { inputTokens: 12, outputTokens: 34 }
  stub.finishReason = "stop"
  stub.failFor.clear()
  runStreamCalls.length = 0
  afterCallbacks.length = 0
})

async function seedVersion(userId: string) {
  const prompt = await createPrompt(userId)
  return prompt.versions[0]
}

describe("POST /api/run", () => {
  it("returns 401 when signed out", async () => {
    expect((await postRun(jsonRequest("POST", "/api/run", { promptVersionId: "v", model: MODEL_A }))).status).toBe(401)
  })

  it.each([
    ["malformed JSON", () => rawRequest("POST", "/api/run", "{bad")],
    ["missing promptVersionId", () => jsonRequest("POST", "/api/run", { model: MODEL_A })],
    ["unknown model", () => jsonRequest("POST", "/api/run", { promptVersionId: "v", model: "gpt-99" })],
    ["unavailable provider", () => jsonRequest("POST", "/api/run", { promptVersionId: "v", model: "gpt-4o" })],
    ["bad variables", () => jsonRequest("POST", "/api/run", { promptVersionId: "v", model: MODEL_A, variables: { a: 1 } })],
  ])("rejects %s with 400", async (_label, makeReq) => {
    const user = await createUser()
    signInAs(user.clerkId)
    expect((await postRun(makeReq())).status).toBe(400)
    expect(runStreamCalls).toHaveLength(0)
  })

  it("returns 404 for an unknown version and 403 for another user's", async () => {
    const me = await createUser()
    const other = await createUser()
    const theirs = await seedVersion(other.id)

    signInAs(me.clerkId)
    expect((await postRun(jsonRequest("POST", "/api/run", { promptVersionId: "nope", model: MODEL_A }))).status).toBe(404)
    expect((await postRun(jsonRequest("POST", "/api/run", { promptVersionId: theirs.id, model: MODEL_A }))).status).toBe(403)
    expect(runStreamCalls).toHaveLength(0)
  })

  it("streams the response, then persists the run and usage from the after() hook", async () => {
    const user = await createUser()
    const version = await seedVersion(user.id) // userPrompt: "Say hi to {{name}}"

    signInAs(user.clerkId)
    const res = await postRun(
      jsonRequest("POST", "/api/run", {
        promptVersionId: version.id,
        model: MODEL_A,
        temperature: 0.2,
        maxTokens: 128,
        variables: { name: "Ada" },
      })
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("Hello world")

    // {{name}} interpolated before the provider sees the prompt
    expect(runStreamCalls[0].userPrompt).toBe("Say hi to Ada")

    // Nothing persists until the after() hook runs, streaming never blocks on the DB.
    expect(await prisma.promptRun.count()).toBe(0)
    await flushAfter()

    const run = await prisma.promptRun.findFirstOrThrow()
    expect(run).toMatchObject({
      promptVersionId: version.id,
      userId: user.id,
      model: MODEL_A,
      provider: "anthropic",
      temperature: 0.2,
      maxTokens: 128,
      inputTokens: 12,
      outputTokens: 34,
      responseText: "Hello world",
      finishReason: "stop",
    })
    expect(run.costUsd).toBeCloseTo(calculateCost(MODEL_A, 12, 34), 12)

    const usage = await prisma.usageSummary.findFirstOrThrow({ where: { userId: user.id } })
    expect(usage).toMatchObject({ totalRuns: 1, totalInputTokens: 12, totalOutputTokens: 34 })
  })

  it("accumulates UsageSummary across runs on the same day", async () => {
    const user = await createUser()
    const version = await seedVersion(user.id)
    signInAs(user.clerkId)

    const body = { promptVersionId: version.id, model: MODEL_A }
    await postRun(jsonRequest("POST", "/api/run", body))
    await flushAfter()
    await postRun(jsonRequest("POST", "/api/run", body))
    await flushAfter()

    const usage = await prisma.usageSummary.findMany({ where: { userId: user.id } })
    expect(usage).toHaveLength(1) // one row per day, upserted
    expect(usage[0].totalRuns).toBe(2)
    expect(usage[0].totalInputTokens).toBe(24)
  })
})

describe("POST /api/compare", () => {
  function compareBody(promptVersionId: string, models = [MODEL_A, MODEL_B]) {
    return {
      promptVersionId,
      slots: models.map((model, slot) => ({ slot, model })),
      variables: { name: "Ada" },
    }
  }

  it("returns 401 when signed out", async () => {
    expect((await postCompare(jsonRequest("POST", "/api/compare", compareBody("v")))).status).toBe(401)
  })

  it.each([
    ["empty slots", { slots: [] }],
    ["more than 3 slots", { slots: [0, 1, 2, 3].map((slot) => ({ slot, model: MODEL_A })) }],
    ["duplicate slot indices", { slots: [{ slot: 0, model: MODEL_A }, { slot: 0, model: MODEL_B }] }],
    ["slot index out of range", { slots: [{ slot: 5, model: MODEL_A }] }],
  ])("rejects %s with 400", async (_label, patch) => {
    const user = await createUser()
    const version = await seedVersion(user.id)
    signInAs(user.clerkId)
    const res = await postCompare(jsonRequest("POST", "/api/compare", { ...compareBody(version.id), ...patch }))
    expect(res.status).toBe(400)
    expect(runStreamCalls).toHaveLength(0)
  })

  it("returns 403 for another user's version", async () => {
    const me = await createUser()
    const other = await createUser()
    const theirs = await seedVersion(other.id)
    signInAs(me.clerkId)
    expect((await postCompare(jsonRequest("POST", "/api/compare", compareBody(theirs.id)))).status).toBe(403)
  })

  async function ndjsonEvents(res: Response) {
    return (await res.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
  }

  it("streams per-slot chunk and done events, persisting one run per slot", async () => {
    const user = await createUser()
    const version = await seedVersion(user.id)

    signInAs(user.clerkId)
    const res = await postCompare(jsonRequest("POST", "/api/compare", compareBody(version.id)))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("ndjson")

    const events = await ndjsonEvents(res)
    for (const slot of [0, 1]) {
      const chunks = events.filter((e) => e.type === "chunk" && e.slot === slot)
      expect(chunks.map((c) => c.text).join("")).toBe("Hello world")
      const done = events.find((e) => e.type === "done" && e.slot === slot)
      expect(done).toMatchObject({ inputTokens: 12, outputTokens: 34 })
      expect(done?.runId).toBeTruthy()
    }

    const runs = await prisma.promptRun.findMany({ orderBy: { model: "asc" } })
    expect(runs.map((r) => r.model).sort()).toEqual([MODEL_B, MODEL_A].sort())
    expect(runs.every((r) => r.responseText === "Hello world" && r.userId === user.id)).toBe(true)

    const usage = await prisma.usageSummary.findFirstOrThrow({ where: { userId: user.id } })
    expect(usage.totalRuns).toBe(2)
  })

  it("a failing slot emits an error event and persists nothing, without sinking the other slot", async () => {
    const user = await createUser()
    const version = await seedVersion(user.id)
    stub.failFor.add(MODEL_B)

    signInAs(user.clerkId)
    const res = await postCompare(jsonRequest("POST", "/api/compare", compareBody(version.id)))
    const events = await ndjsonEvents(res)

    const failed = events.find((e) => e.type === "error" && e.slot === 1)
    expect(failed?.error).toContain("provider exploded")
    expect(events.find((e) => e.type === "done" && e.slot === 1)).toBeUndefined()

    const done = events.find((e) => e.type === "done" && e.slot === 0)
    expect(done?.runId).toBeTruthy()

    const runs = await prisma.promptRun.findMany()
    expect(runs).toHaveLength(1)
    expect(runs[0].model).toBe(MODEL_A)
  })
})
