import { describe, expect, it } from "vitest"
import { mean, sampleVariance, buildWinMatrix, MIN_SCORED_ROWS, type CellStats } from "./stats"

describe("mean", () => {
  it("returns null for an empty array", () => {
    expect(mean([])).toBeNull()
  })

  it("averages values", () => {
    expect(mean([1, 2, 3])).toBe(2)
  })

  it("handles a single value", () => {
    expect(mean([0.5])).toBe(0.5)
  })
})

describe("sampleVariance", () => {
  it("returns null for an empty array", () => {
    expect(sampleVariance([])).toBeNull()
  })

  it("returns 0 for a single value (no spread)", () => {
    expect(sampleVariance([0.7])).toBe(0)
  })

  it("uses n-1 (sample) denominator", () => {
    // values [0,2]: mean 1, squared devs 1+1=2, /(2-1) = 2
    expect(sampleVariance([0, 2])).toBe(2)
  })

  it("returns ~0 when all values are identical (modulo float error)", () => {
    expect(sampleVariance([0.4, 0.4, 0.4])).toBeCloseTo(0, 10)
  })
})

describe("buildWinMatrix", () => {
  const cells: CellStats[] = [
    { promptVersionId: "v1", model: "claude", avgScore: 0.9, scoredRows: 20 },
    { promptVersionId: "v2", model: "claude", avgScore: 0.6, scoredRows: 20 },
  ]

  it("produces a pairwise entry with positive meanDiff when a beats b", () => {
    const m = buildWinMatrix(cells, ["v1", "v2"], ["claude"])
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ a: "v1", b: "v2", model: "claude" })
    expect(m[0].meanDiff).toBeCloseTo(0.3)
    expect(m[0].insufficientSample).toBe(false)
  })

  it("respects variant order for the a/b assignment (sign follows order)", () => {
    const m = buildWinMatrix(cells, ["v2", "v1"], ["claude"])
    expect(m[0]).toMatchObject({ a: "v2", b: "v1" })
    expect(m[0].meanDiff).toBeCloseTo(-0.3)
  })

  it("flags insufficientSample when either cell is below the threshold", () => {
    const sparse: CellStats[] = [
      { promptVersionId: "v1", model: "claude", avgScore: 0.9, scoredRows: MIN_SCORED_ROWS - 1 },
      { promptVersionId: "v2", model: "claude", avgScore: 0.6, scoredRows: 50 },
    ]
    const m = buildWinMatrix(sparse, ["v1", "v2"], ["claude"])
    expect(m[0].insufficientSample).toBe(true)
  })

  it("skips a pairing when one cell never produced a score", () => {
    const withFailure: CellStats[] = [
      { promptVersionId: "v1", model: "claude", avgScore: null, scoredRows: 0 },
      { promptVersionId: "v2", model: "claude", avgScore: 0.6, scoredRows: 20 },
    ]
    expect(buildWinMatrix(withFailure, ["v1", "v2"], ["claude"])).toHaveLength(0)
  })

  it("skips a pairing when a cell is missing entirely", () => {
    expect(buildWinMatrix(cells, ["v1", "v2", "v3"], ["claude"])).toHaveLength(1)
  })

  it("produces an entry per model and every unordered variant pair", () => {
    const threeVariants: CellStats[] = [
      { promptVersionId: "v1", model: "gpt", avgScore: 0.5, scoredRows: 20 },
      { promptVersionId: "v2", model: "gpt", avgScore: 0.6, scoredRows: 20 },
      { promptVersionId: "v3", model: "gpt", avgScore: 0.7, scoredRows: 20 },
    ]
    // C(3,2) = 3 pairs, one model
    expect(buildWinMatrix(threeVariants, ["v1", "v2", "v3"], ["gpt"])).toHaveLength(3)
  })
})
