import { describe, expect, it } from "vitest"
import { runDeterministicCriterion, computeTotalScore } from "./matchers"
import { REGEX_INPUT_CAP } from "./criteria"
import type { Criterion, CriterionScore } from "@/types/eval"

function crit(partial: Partial<Criterion> & Pick<Criterion, "type" | "config">): Criterion {
  return { name: partial.name ?? "c", weight: partial.weight ?? 1, type: partial.type, config: partial.config }
}

describe("runDeterministicCriterion — exact", () => {
  it("scores 1 on an exact match", () => {
    const r = runDeterministicCriterion(crit({ type: "exact", config: { expected: "hello" } }), "hello")
    expect(r.score).toBe(1)
  })

  it("scores 0 when it differs", () => {
    const r = runDeterministicCriterion(crit({ type: "exact", config: { expected: "hello" } }), "Hello")
    expect(r.score).toBe(0)
  })

  it("respects caseSensitive: false", () => {
    const r = runDeterministicCriterion(
      crit({ type: "exact", config: { expected: "HELLO", caseSensitive: false } }),
      "hello"
    )
    expect(r.score).toBe(1)
  })

  it("respects trim", () => {
    const r = runDeterministicCriterion(crit({ type: "exact", config: { expected: "hi", trim: true } }), "  hi  ")
    expect(r.score).toBe(1)
  })

  it("does not trim by default (whitespace counts)", () => {
    const r = runDeterministicCriterion(crit({ type: "exact", config: { expected: "hi" } }), " hi ")
    expect(r.score).toBe(0)
  })
})

describe("runDeterministicCriterion — contains", () => {
  it("finds a substring", () => {
    const r = runDeterministicCriterion(crit({ type: "contains", config: { substring: "wor" } }), "hello world")
    expect(r.score).toBe(1)
  })

  it("is case-insensitive when configured", () => {
    const r = runDeterministicCriterion(
      crit({ type: "contains", config: { substring: "WORLD", caseSensitive: false } }),
      "hello world"
    )
    expect(r.score).toBe(1)
  })

  it("scores 0 when absent", () => {
    const r = runDeterministicCriterion(crit({ type: "contains", config: { substring: "xyz" } }), "hello world")
    expect(r.score).toBe(0)
  })
})

describe("runDeterministicCriterion — regex", () => {
  it("matches a valid pattern", () => {
    const r = runDeterministicCriterion(crit({ type: "regex", config: { pattern: "^\\d{3}$" } }), "123")
    expect(r.score).toBe(1)
  })

  it("honors flags", () => {
    const r = runDeterministicCriterion(crit({ type: "regex", config: { pattern: "abc", flags: "i" } }), "ABC")
    expect(r.score).toBe(1)
  })

  it("scores 0 on a non-match", () => {
    const r = runDeterministicCriterion(crit({ type: "regex", config: { pattern: "^x" } }), "yz")
    expect(r.score).toBe(0)
  })

  it("returns score 0 (not throw) on an invalid pattern", () => {
    const r = runDeterministicCriterion(crit({ type: "regex", config: { pattern: "(" } }), "anything")
    expect(r.score).toBe(0)
    expect(r.detail).toContain("invalid regex")
  })

  it("only inspects the first REGEX_INPUT_CAP bytes (ReDoS cap)", () => {
    // Needle placed just past the cap must NOT match.
    const text = "a".repeat(REGEX_INPUT_CAP) + "NEEDLE"
    const r = runDeterministicCriterion(crit({ type: "regex", config: { pattern: "NEEDLE" } }), text)
    expect(r.score).toBe(0)
  })
})

describe("runDeterministicCriterion — json_schema", () => {
  const schema = { type: "object", required: ["name"], properties: { name: { type: "string" } } }

  it("scores 1 when JSON matches the schema", () => {
    const r = runDeterministicCriterion(crit({ type: "json_schema", config: { schema } }), '{"name":"x"}')
    expect(r.score).toBe(1)
  })

  it("scores 0 with a violation path in the detail", () => {
    const r = runDeterministicCriterion(crit({ type: "json_schema", config: { schema } }), '{"other":1}')
    expect(r.score).toBe(0)
    expect(r.detail).toContain("schema violation")
  })

  it("scores 0 when the response is not valid JSON", () => {
    const r = runDeterministicCriterion(crit({ type: "json_schema", config: { schema } }), "not json")
    expect(r.score).toBe(0)
    expect(r.detail).toContain("not valid JSON")
  })
})

describe("runDeterministicCriterion — ai_judge guard", () => {
  it("throws because ai_judge is not deterministic", () => {
    expect(() =>
      runDeterministicCriterion(crit({ type: "ai_judge", config: { instructions: "x" } }), "y")
    ).toThrow(/not deterministic/)
  })
})

describe("computeTotalScore", () => {
  const s = (name: string, weight: number, score: number): CriterionScore => ({
    name,
    type: "exact",
    weight,
    score,
  })

  it("returns a weighted mean in [0,1]", () => {
    expect(computeTotalScore([s("a", 1, 1), s("b", 1, 0)])).toBe(0.5)
  })

  it("weights criteria proportionally", () => {
    // weight 3 at 1.0, weight 1 at 0.0 => 0.75
    expect(computeTotalScore([s("a", 3, 1), s("b", 1, 0)])).toBe(0.75)
  })

  it("returns 0 when total weight is 0 (no divide-by-zero)", () => {
    expect(computeTotalScore([s("a", 0, 1)])).toBe(0)
  })

  it("returns 0 for an empty score list", () => {
    expect(computeTotalScore([])).toBe(0)
  })

  it("returns 1 when every criterion passes", () => {
    expect(computeTotalScore([s("a", 2, 1), s("b", 5, 1)])).toBe(1)
  })
})
