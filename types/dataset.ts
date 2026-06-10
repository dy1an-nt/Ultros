// Shared dataset-testing contract — owned by the architect plan
// (docs/sprint-summary/sprint-4-architect.md). Backend and frontend both
// import from here; do not redefine these shapes.

export type DatasetDto = {
  id: string
  name: string
  description: string | null
  columns: string[]
  rowCount: number
  createdAt: string
}

export type DatasetRowDto = {
  id: string
  rowIndex: number
  data: Record<string, string>
  expectedOutput: string | null
}

export type DatasetDetailDto = DatasetDto & { rows: DatasetRowDto[] }

export type DatasetRunStatus = "pending" | "running" | "complete" | "failed"

export type DatasetRunDto = {
  id: string
  datasetId: string
  promptVersionId: string
  rubricId: string | null
  model: string
  temperature: number
  maxTokens: number
  variableMapping: Record<string, string>
  status: DatasetRunStatus
  totalRows: number
  completedRows: number
  failedRows: number
  avgScore: number | null
  scoreVariance: number | null
  passRate: number | null
  avgLatencyMs: number | null
  totalCostUsd: number
  error: string | null
  createdAt: string
  completedAt: string | null
}

export type RunEstimate = {
  rowCount: number
  estimatedInputTokens: number
  estimatedCostUsd: number
  perRowCapUsd: number
}

export type DatasetRunRowItem = {
  rowIndex: number
  input: Record<string, string>
  expectedOutput: string | null
  responseText: string
  latencyMs: number
  costUsd: number
  finishReason: string | null
  eval: {
    id: string
    status: string
    totalScore: number | null
    passed: boolean | null
  } | null
}
