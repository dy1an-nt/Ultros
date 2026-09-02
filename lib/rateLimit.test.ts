import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const limit = vi.fn()
const captureException = vi.fn()

vi.mock("@upstash/redis", () => ({ Redis: class {} }))
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    class {
      limit = limit
    },
    { slidingWindow: () => ({}) }
  ),
}))
vi.mock("@sentry/nextjs", () => ({ captureException }))

// The Redis handle is cached at module scope on first use, so each test loads
// a fresh copy of the module with the env it needs.
async function load(configured: boolean) {
  vi.resetModules()
  if (configured) {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test"
    process.env.UPSTASH_REDIS_REST_TOKEN = "token"
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  }
  return import("@/lib/rateLimit")
}

const req = (h: Record<string, string>) => new Request("https://x.test/", { headers: h })

beforeEach(() => {
  limit.mockReset()
  captureException.mockReset()
})

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

describe("clientIp", () => {
  it("prefers the header Vercel sets itself", async () => {
    const { clientIp } = await load(false)
    expect(clientIp(req({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }))).toBe("9.9.9.9")
  })

  it("takes the rightmost hop, not the caller-controlled leftmost", async () => {
    const { clientIp } = await load(false)
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe("203.0.113.7")
  })

  it("handles a single-entry chain", async () => {
    const { clientIp } = await load(false)
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7")
  })

  it("falls back to unknown with no proxy headers", async () => {
    const { clientIp } = await load(false)
    expect(clientIp(req({}))).toBe("unknown")
  })
})

describe("checkRateLimit", () => {
  it("fails open when Redis is unconfigured", async () => {
    const { checkRateLimit } = await load(false)
    expect(await checkRateLimit("run", "user-1")).toEqual({ ok: true })
    expect(limit).not.toHaveBeenCalled()
  })

  it("passes through an allowed request", async () => {
    const { checkRateLimit } = await load(true)
    limit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 })
    expect(await checkRateLimit("run", "user-1")).toEqual({ ok: true })
  })

  it("reports seconds until reset when the window is exhausted", async () => {
    const { checkRateLimit } = await load(true)
    limit.mockResolvedValue({ success: false, reset: Date.now() + 4_200 })
    const result = await checkRateLimit("sharePublic", "1.2.3.4")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.retryAfterSec).toBe(5)
  })

  it("never reports a retry of less than a second", async () => {
    const { checkRateLimit } = await load(true)
    limit.mockResolvedValue({ success: false, reset: Date.now() - 1_000 })
    const result = await checkRateLimit("launch", "user-1")
    if (!result.ok) expect(result.retryAfterSec).toBe(1)
  })

  it("fails open and reports to Sentry when Redis throws", async () => {
    const { checkRateLimit } = await load(true)
    limit.mockRejectedValue(new Error("redis down"))
    expect(await checkRateLimit("mutation", "user-1")).toEqual({ ok: true })
    expect(captureException).toHaveBeenCalledOnce()
  })
})

describe("rateLimitResponse", () => {
  it("returns 429 with Retry-After and the error envelope", async () => {
    const { rateLimitResponse } = await load(false)
    const res = rateLimitResponse({ retryAfterSec: 7 })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("7")
    const body = await res.json()
    expect(body.data).toBeNull()
    expect(body.error.code).toBe("RATE_LIMITED")
  })
})
