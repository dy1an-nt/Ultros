// Shared eval contract — owned by the architect plan (docs/sprint-summary/sprint-3-architect.md).
// Backend and frontend both import from here; do not redefine these shapes.

export type CriterionType = "ai_judge" | "exact" | "regex" | "json_schema" | "contains"

export type AiJudgeConfig = { instructions: string }
export type ExactConfig = { expected: string; caseSensitive?: boolean; trim?: boolean }
export type RegexConfig = { pattern: string; flags?: string }
export type JsonSchemaConfig = { schema: Record<string, unknown> }
export type ContainsConfig = { substring: string; caseSensitive?: boolean }

export type CriterionConfig =
  | AiJudgeConfig
  | ExactConfig
  | RegexConfig
  | JsonSchemaConfig
  | ContainsConfig

export type Criterion = {
  name: string
  type: CriterionType
  weight: number
  config: CriterionConfig
}

export type RubricDto = {
  id: string
  name: string
  description: string | null
  criteria: Criterion[]
  passThreshold: number
  createdAt: string
  updatedAt: string
}

export type EvalStatus = "pending" | "running" | "complete" | "failed"
export type EvalMethod = "deterministic" | "ai_judge" | "mixed"

export type CriterionScore = {
  name: string
  type: CriterionType
  weight: number
  score: number // 0–1; deterministic matchers produce exactly 0 or 1
  detail?: string
}

export type CriteriaSnapshot = {
  rubricName: string
  passThreshold: number
  criteria: Criterion[]
}

export type EvaluationDto = {
  id: string
  promptRunId: string
  rubricId: string | null
  status: EvalStatus
  totalScore: number | null
  passed: boolean | null
  criteriaScores: CriterionScore[] | null
  criteriaSnapshot: CriteriaSnapshot
  aiEvalReasoning: string | null
  evalMethod: EvalMethod
  judgeModel: string | null
  judgeCostUsd: number | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

export type EvalHistoryItem = EvaluationDto & {
  run: {
    id: string
    model: string
    createdAt: string
    promptVersionId: string
    versionNumber: number
  }
}

export type LeaderboardRow = {
  promptVersionId: string
  versionNumber: number
  label: string | null
  avgScore: number
  passRate: number
  evalCount: number
}
