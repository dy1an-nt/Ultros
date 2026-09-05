import { describe, it, expect } from "vitest"
import { CRITERION_HANDLERS, CRITERION_TYPES, isCriterionType } from "./criterionTypes"

// The registry's contract, so a new criterion type cannot half-land: the
// mapped type makes TypeScript demand an entry, and these cover the parts the
// type system cannot see.

describe("criterion registry", () => {
  it("advertises exactly the types it can handle", () => {
    expect(CRITERION_TYPES).toEqual(Object.keys(CRITERION_HANDLERS))
    expect(CRITERION_TYPES).toContain("ai_judge")
  })

  it("gives every type a config validator", () => {
    for (const type of CRITERION_TYPES) {
      expect(typeof CRITERION_HANDLERS[type].validate).toBe("function")
    }
  })

  it("omits a scorer only for the type a judge model settles", () => {
    const withoutScore = CRITERION_TYPES.filter((t) => !CRITERION_HANDLERS[t].score)
    expect(withoutScore).toEqual(["ai_judge"])
  })

  it("rejects anything that is not a registered type", () => {
    expect(isCriterionType("contains")).toBe(true)
    expect(isCriterionType("semantic")).toBe(false)
    expect(isCriterionType("")).toBe(false)
    expect(isCriterionType(null)).toBe(false)
    // Prototype keys are not criterion types.
    expect(isCriterionType("toString")).toBe(false)
    expect(isCriterionType("constructor")).toBe(false)
  })
})
