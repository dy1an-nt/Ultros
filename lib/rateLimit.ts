import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import * as Sentry from "@sentry/nextjs"
import { errorBody } from "@/lib/api/errors"

// One limiter, five route classes (architect pin #4). Applied as an explicit
// helper call at the top of each limited route — no middleware magic that
// hides which routes are limited. Keyed by userId everywhere except the
// public share view, which has no user and is keyed by IP.
export type LimitClass = "run" | "eval" | "launch" | "mutation" | "sharePublic"

const WINDOW = "60 s"
const LIMITS: Record<LimitClass, number> = {
  run: 30, // single runs + compare
  eval: 60, // manual eval triggers
  launch: 5, // dataset-run + experiment + regression launches (cost fan-out)
  mutation: 60, // CRUD writes
  sharePublic: 60, // public share views, per IP
}

let redis: Redis | null | undefined
const limiters = new Map<LimitClass, Ratelimit>()

function getLimiter(cls: LimitClass): Ratelimit | null {
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    redis = url && token ? new Redis({ url, token }) : null
  }
  if (redis === null) return null
  let limiter = limiters.get(cls)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMITS[cls], WINDOW),
      prefix: `rl:${cls}`,
    })
    limiters.set(cls, limiter)
  }
  return limiter
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

// Fails OPEN when Redis is unconfigured or down — availability over
// strictness for a portfolio product — but reports to Sentry so silent
// no-limiting is visible.
export async function checkRateLimit(cls: LimitClass, key: string): Promise<RateLimitResult> {
  const limiter = getLimiter(cls)
  if (!limiter) return { ok: true }
  try {
    const { success, reset } = await limiter.limit(key)
    if (success) return { ok: true }
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) }
  } catch (err) {
    Sentry.captureException(err)
    return { ok: true }
  }
}

export function rateLimitResponse(result: { retryAfterSec: number }): Response {
  return Response.json(
    errorBody("RATE_LIMITED", "Rate limit exceeded — slow down and retry shortly"),
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  )
}

// First proxied client IP, for the unauthenticated share view.
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  return fwd ? fwd.split(",")[0].trim() : "unknown"
}
