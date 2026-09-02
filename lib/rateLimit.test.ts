import { describe, it, expect } from "vitest"
import { clientIp } from "@/lib/rateLimit"

const req = (h: Record<string, string>) => new Request("https://x.test/", { headers: h })

describe("clientIp", () => {
  it("prefers Vercel's own client-IP header", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }))).toBe("9.9.9.9")
  })
  it("takes the rightmost XFF hop, not the caller-controlled leftmost", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe("203.0.113.7")
  })
  it("ignores a spoofed single-entry XFF only insofar as it is the real hop", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7")
  })
  it("falls back to unknown with no proxy headers", () => {
    expect(clientIp(req({}))).toBe("unknown")
  })
})
