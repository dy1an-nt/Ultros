import type { Criterion, CriterionConfig, CriterionScore } from "@/types/eval"
import { CRITERION_HANDLERS, type DeterministicResult } from "./criterionTypes"

// Runs a single deterministic criterion against the response text.
// Deterministic matchers produce exactly 0 or 1 per the contract.
export function runDeterministicCriterion(criterion: Criterion, responseText: string): CriterionScore {
  const score = CRITERION_HANDLERS[criterion.type].score as
    | ((config: CriterionConfig, responseText: string) => DeterministicResult)
    | undefined
  // The shared Criterion type keeps `type` and `config` independent, so the
  // registry's per-type config is asserted here, once, instead of at each matcher.
  if (!score) throw new Error(`${criterion.type} criteria are not deterministic`)

  const result = score(criterion.config, responseText)
  return {
    name: criterion.name,
    type: criterion.type,
    weight: criterion.weight,
    score: result.score,
    detail: result.detail,
  }
}

// totalScore = Σ(weightᵢ × scoreᵢ) / Σ(weightᵢ), weighted mean in [0, 1].
export function computeTotalScore(scores: CriterionScore[]): number {
  const weightSum = scores.reduce((acc, s) => acc + s.weight, 0)
  if (weightSum === 0) return 0
  const weighted = scores.reduce((acc, s) => acc + s.weight * s.score, 0)
  return weighted / weightSum
}
