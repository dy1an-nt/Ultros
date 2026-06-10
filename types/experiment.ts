// Shared experiments + regression contract — owned by the architect plan
// (docs/sprint-summary/sprint-5-architect.md). Backend and frontend both
// import from here; do not redefine these shapes.

import type { DatasetRunStatus } from "./dataset"
import type { WinMatrixEntry } from "@/lib/experiments/stats"

export type ExperimentStatus = "pending" | "running" | "complete"

export type ExperimentDto = {
  id: string
  name: string
  datasetId: string
  rubricId: string
  variantVersionIds: string[]
  models: string[]
  status: ExperimentStatus
  createdAt: string
  completedAt: string | null
}

export type ExperimentListItem = ExperimentDto & {
  cellsTotal: number
  cellsTerminal: number
}

export type ExperimentCellDto = {
  promptVersionId: string
  model: string
  datasetRunId: string
  status: DatasetRunStatus
  totalRows: number
  completedRows: number
  failedRows: number
}

export type VersionLabel = { id: string; versionNumber: number; label: string | null }

export type ExperimentDetailDto = ExperimentDto & {
  cells: ExperimentCellDto[]
  datasetName: string | null
  rubricName: string | null
  versions: VersionLabel[]
}

export type ExperimentResultDto = {
  promptVersionId: string
  model: string
  datasetRunId: string
  avgScore: number | null
  scoreVariance: number | null
  avgLatencyMs: number | null
  passRate: number | null
  totalCostUsd: number
  scoredRows: number
  cellStatus: "complete" | "failed"
}

// Per-criterion mean score within one cell — drives CriterionBreakdown.
export type CriterionStat = {
  promptVersionId: string
  model: string
  criterion: string
  avgScore: number
  count: number
}

export type ExperimentResultsDto = {
  results: ExperimentResultDto[]
  winMatrix: WinMatrixEntry[]
  criterionStats: CriterionStat[]
}

export type BaselineDto = {
  id: string
  promptId: string
  promptVersionId: string
  versionNumber: number | null
  datasetId: string
  datasetName: string | null
  rubricId: string
  rubricName: string | null
  datasetRunId: string
  model: string | null // the baseline run's model — regressions reuse it
  baselineScore: number
  baselinePassRate: number
  setAt: string
}

export type RegressionStatus = "pending" | "complete" | "failed"

export type RegressionRunDto = {
  id: string
  newVersionId: string
  versionNumber: number | null
  datasetRunId: string
  status: RegressionStatus
  newScore: number | null
  newPassRate: number | null
  scoreDelta: number | null
  threshold: number
  regressed: boolean | null
  regressedRowIds: string[]
  createdAt: string
  completedAt: string | null
}

export type RegressionHistoryDto = {
  baseline: BaselineDto | null
  runs: RegressionRunDto[]
}
