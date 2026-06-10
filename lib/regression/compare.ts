// Pure regression comparison — no DB, no IO, unit-executable.
// Rows are matched baseline↔new by rowIndex: datasets are immutable after
// creation (Sprint 4 decision), so the same rowIndex is the same input.

export const DEFAULT_REGRESSION_THRESHOLD = 0.05
export const MIN_REGRESSION_THRESHOLD = 0.01
export const MAX_REGRESSION_THRESHOLD = 0.5

// IEEE-754 guard: 0.75 - 0.8 is -0.050000000000000044, which a strict `<`
// would flag at a 0.05 threshold. "Dropped by exactly the threshold" must not
// count as regressed.
const EPSILON = 1e-9

export type RowEvalScore = {
  datasetRowId: string
  rowIndex: number
  score: number | null // null = row went unscored (e.g. failed generation)
  passed: boolean | null
}

export type RegressionComparison = {
  scoreDelta: number // newScore - baselineScore
  regressed: boolean // scoreDelta < -threshold
  regressedRowIds: string[] // DatasetRow ids, ascending rowIndex
}

// Row-level rule (architect pin #5): a row regressed if its pass flipped
// true→false OR its score dropped by more than the run threshold.
export function compareToBaseline(input: {
  baselineScore: number
  newScore: number
  threshold: number
  baselineRows: RowEvalScore[]
  newRows: RowEvalScore[]
}): RegressionComparison {
  const baseByIndex = new Map(input.baselineRows.map((r) => [r.rowIndex, r]))
  const regressedRowIds: string[] = []
  const sortedNew = [...input.newRows].sort((a, b) => a.rowIndex - b.rowIndex)
  for (const row of sortedNew) {
    const base = baseByIndex.get(row.rowIndex)
    if (!base) continue
    const passFlipped = base.passed === true && row.passed === false
    const scoreDropped =
      base.score !== null && row.score !== null && base.score - row.score > input.threshold + EPSILON
    if (passFlipped || scoreDropped) regressedRowIds.push(row.datasetRowId)
  }
  const scoreDelta = input.newScore - input.baselineScore
  return { scoreDelta, regressed: scoreDelta < -input.threshold - EPSILON, regressedRowIds }
}

// Returns a validated threshold or an error message.
export function validateThreshold(value: unknown): { threshold: number; error: null } | { threshold: null; error: string } {
  if (value === undefined || value === null) {
    return { threshold: DEFAULT_REGRESSION_THRESHOLD, error: null }
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < MIN_REGRESSION_THRESHOLD ||
    value > MAX_REGRESSION_THRESHOLD
  ) {
    return {
      threshold: null,
      error: `threshold must be a number between ${MIN_REGRESSION_THRESHOLD} and ${MAX_REGRESSION_THRESHOLD}`,
    }
  }
  return { threshold: value, error: null }
}
