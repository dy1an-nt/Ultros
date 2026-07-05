import { describe, expect, it } from "vitest"
import {
  validateCriteria,
  validatePassThreshold,
  validateRubricName,
  MAX_CRITERIA,
  MAX_REGEX_PATTERN_LENGTH,
} from "./criteria"

const ok = (config: object, type = "exact") => [{ name: "c", type, weight: 1, config }]

describe("validateCriteria — structure", () => {
  it("rejects a non-array", () => {
    expect(validateCriteria({}).error).toMatch(/must be an array/)
  })

  it("rejects an empty array", () => {
    expect(validateCriteria([]).error).toMatch(/1–/)
  })

  it("rejects more than MAX_CRITERIA", () => {
    const many = Array.from({ length: MAX_CRITERIA + 1 }, (_, i) => ({
      name: `c${i}`,
      type: "contains",
      weight: 1,
      config: { substring: "x" },
    }))
    expect(validateCriteria(many).error).toMatch(/1–/)
  })

  it("rejects duplicate criterion names", () => {
    const dup = [
      { name: "dup", type: "contains", weight: 1, config: { substring: "a" } },
      { name: "dup", type: "contains", weight: 1, config: { substring: "b" } },
    ]
    expect(validateCriteria(dup).error).toMatch(/duplicate/)
  })

  it("rejects an unknown type", () => {
    expect(validateCriteria(ok({ expected: "x" }, "bogus")).error).toMatch(/type/)
  })

  it("rejects a non-positive weight", () => {
    expect(validateCriteria([{ name: "c", type: "contains", weight: 0, config: { substring: "x" } }]).error).toMatch(
      /weight/
    )
  })

  it("rejects a weight above 100", () => {
    expect(
      validateCriteria([{ name: "c", type: "contains", weight: 101, config: { substring: "x" } }]).error
    ).toMatch(/weight/)
  })
})

describe("validateCriteria — config by type", () => {
  it("accepts a well-formed exact criterion", () => {
    const r = validateCriteria(ok({ expected: "hello" }))
    expect(r.error).toBeNull()
    expect(r.criteria).toHaveLength(1)
  })

  it("rejects an invalid regex pattern", () => {
    expect(validateCriteria(ok({ pattern: "(" }, "regex")).error).toMatch(/invalid regex/)
  })

  it("rejects an over-length regex pattern", () => {
    const pattern = "a".repeat(MAX_REGEX_PATTERN_LENGTH + 1)
    expect(validateCriteria(ok({ pattern }, "regex")).error).toMatch(/pattern/)
  })

  it("rejects disallowed regex flags", () => {
    expect(validateCriteria(ok({ pattern: "x", flags: "g" }, "regex")).error).toMatch(/flags/)
  })

  it("rejects a non-object json schema", () => {
    expect(validateCriteria(ok({ schema: "nope" }, "json_schema")).error).toMatch(/schema/)
  })

  it("accepts a valid json schema", () => {
    expect(validateCriteria(ok({ schema: { type: "object" } }, "json_schema")).error).toBeNull()
  })

  it("rejects empty ai_judge instructions", () => {
    expect(validateCriteria(ok({ instructions: "" }, "ai_judge")).error).toMatch(/instructions/)
  })
})

describe("validatePassThreshold", () => {
  it("accepts 0 and 1 (inclusive bounds)", () => {
    expect(validatePassThreshold(0).value).toBe(0)
    expect(validatePassThreshold(1).value).toBe(1)
  })

  it("rejects values outside [0,1]", () => {
    expect(validatePassThreshold(-0.01).value).toBeNull()
    expect(validatePassThreshold(1.01).value).toBeNull()
  })

  it("rejects non-numbers", () => {
    expect(validatePassThreshold("0.5").value).toBeNull()
    expect(validatePassThreshold(NaN).value).toBeNull()
  })
})

describe("validateRubricName", () => {
  it("trims and accepts a normal name", () => {
    expect(validateRubricName("  My Rubric  ")).toEqual({ value: "My Rubric", error: null })
  })

  it("rejects a blank name", () => {
    expect(validateRubricName("   ").value).toBeNull()
  })

  it("rejects an over-length name", () => {
    expect(validateRubricName("a".repeat(101)).value).toBeNull()
  })
})
