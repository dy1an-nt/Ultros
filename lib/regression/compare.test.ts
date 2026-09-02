import { describe, expect, it } from "vitest"
import {
  compareToBaseline,
  validateThreshold,
  DEFAULT_REGRESSION_THRESHOLD,
  MIN_REGRESSION_THRESHOLD,
  MAX_REGRESSION_THRESHOLD,
  type RowEvalScore,
} from "./compare"

const row = (rowIndex: number, score: number | null, passed: boolean | null): RowEvalScore => ({
  datasetRowId: `row-${rowIndex}`,
  rowIndex,
  score,
  passed,
})

describe("compareToBaseline, aggregate verdict", () => {
  it("flags a regression when score drops beyond the threshold", () => {
    const r = compareToBaseline({
      baselineScore: 0.9,
      newScore: 0.8,
      threshold: 0.05,
      baselineRows: [],
      newRows: [],
    })
    expect(r.scoreDelta).toBeCloseTo(-0.1)
    expect(r.regressed).toBe(true)
  })

  it("does NOT regress when the drop equals the threshold exactly (epsilon guard)", () => {
    // 0.8 - 0.75 = 0.05000000000000004 in IEEE-754; must not trip a 0.05 threshold.
    const r = compareToBaseline({
      baselineScore: 0.8,
      newScore: 0.75,
      threshold: 0.05,
      baselineRows: [],
      newRows: [],
    })
    expect(r.regressed).toBe(false)
  })

  it("does not regress on an improvement", () => {
    const r = compareToBaseline({
      baselineScore: 0.6,
      newScore: 0.9,
      threshold: 0.05,
      baselineRows: [],
      newRows: [],
    })
    expect(r.regressed).toBe(false)
    expect(r.scoreDelta).toBeCloseTo(0.3)
  })
})

describe("compareToBaseline, per-row regressions", () => {
  it("flags a row whose pass flipped true -> false", () => {
    const r = compareToBaseline({
      baselineScore: 0.9,
      newScore: 0.9,
      threshold: 0.05,
      baselineRows: [row(0, 1, true)],
      newRows: [row(0, 1, false)],
    })
    expect(r.regressedRowIds).toEqual(["row-0"])
  })

  it("flags a row whose score dropped beyond the threshold", () => {
    const r = compareToBaseline({
      baselineScore: 0.9,
      newScore: 0.9,
      threshold: 0.05,
      baselineRows: [row(2, 1, true)],
      newRows: [row(2, 0.5, true)],
    })
    expect(r.regressedRowIds).toEqual(["row-2"])
  })

  it("matches rows by rowIndex, not array position", () => {
    const r = compareToBaseline({
      baselineScore: 0.9,
      newScore: 0.9,
      threshold: 0.05,
      baselineRows: [row(0, 1, true), row(1, 1, true)],
      newRows: [row(1, 0.2, false), row(0, 1, true)], // shuffled
    })
    expect(r.regressedRowIds).toEqual(["row-1"])
  })

  it("returns regressed row ids in ascending rowIndex order", () => {
    const r = compareToBaseline({
      baselineScore: 0.9,
      newScore: 0.9,
      threshold: 0.05,
      baselineRows: [row(0, 1, true), row(1, 1, true), row(2, 1, true)],
      newRows: [row(2, 0, false), row(0, 0, false), row(1, 0, false)],
    })
    expect(r.regressedRowIds).toEqual(["row-0", "row-1", "row-2"])
  })

  it("ignores rows with null scores (unscored, e.g. failed generation)", () => {
    const r = compareToBaseline({
      baselineScore: 0.9,
      newScore: 0.9,
      threshold: 0.05,
      baselineRows: [row(0, null, null)],
      newRows: [row(0, null, null)],
    })
    expect(r.regressedRowIds).toEqual([])
  })

  it("skips a new row that has no baseline counterpart", () => {
    const r = compareToBaseline({
      baselineScore: 0.9,
      newScore: 0.9,
      threshold: 0.05,
      baselineRows: [],
      newRows: [row(5, 0, false)],
    })
    expect(r.regressedRowIds).toEqual([])
  })
})

describe("validateThreshold", () => {
  it("defaults when undefined or null", () => {
    expect(validateThreshold(undefined)).toEqual({ threshold: DEFAULT_REGRESSION_THRESHOLD, error: null })
    expect(validateThreshold(null)).toEqual({ threshold: DEFAULT_REGRESSION_THRESHOLD, error: null })
  })

  it("accepts values at the bounds", () => {
    expect(validateThreshold(MIN_REGRESSION_THRESHOLD).threshold).toBe(MIN_REGRESSION_THRESHOLD)
    expect(validateThreshold(MAX_REGRESSION_THRESHOLD).threshold).toBe(MAX_REGRESSION_THRESHOLD)
  })

  it("rejects out-of-range values", () => {
    expect(validateThreshold(MIN_REGRESSION_THRESHOLD - 0.001).threshold).toBeNull()
    expect(validateThreshold(MAX_REGRESSION_THRESHOLD + 0.001).threshold).toBeNull()
  })

  it("rejects non-finite and non-number inputs", () => {
    expect(validateThreshold(NaN).error).not.toBeNull()
    expect(validateThreshold(Infinity).error).not.toBeNull()
    expect(validateThreshold("0.1").error).not.toBeNull()
  })
})
