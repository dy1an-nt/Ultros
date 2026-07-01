import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { sanitizeErrorMessage } from "./sanitize"

describe("sanitizeErrorMessage", () => {
  const original = { ...process.env }

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret-123"
    process.env.OPENAI_API_KEY = "sk-openai-secret-456"
  })

  afterEach(() => {
    process.env = { ...original }
  })

  it("redacts a leaked API key from the message", () => {
    const out = sanitizeErrorMessage("auth failed for key sk-ant-secret-123 at provider")
    expect(out).not.toContain("sk-ant-secret-123")
    expect(out).toContain("[redacted]")
  })

  it("redacts every occurrence of a key", () => {
    const out = sanitizeErrorMessage("sk-ant-secret-123 ... sk-ant-secret-123")
    expect(out).not.toContain("sk-ant-secret-123")
  })

  it("redacts multiple distinct keys", () => {
    const out = sanitizeErrorMessage("keys sk-ant-secret-123 and sk-openai-secret-456")
    expect(out).not.toContain("sk-ant-secret-123")
    expect(out).not.toContain("sk-openai-secret-456")
  })

  it("caps the message length at 2000 characters", () => {
    expect(sanitizeErrorMessage("x".repeat(5000))).toHaveLength(2000)
  })

  it("leaves a clean message untouched", () => {
    expect(sanitizeErrorMessage("rate limit exceeded")).toBe("rate limit exceeded")
  })
})
