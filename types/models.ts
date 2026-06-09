export type ProviderName = "anthropic" | "openai" | "google" | "openrouter"
export type ModelCategory = "direct" | "openrouter"

export type ModelInfo = {
  id: string
  displayName: string
  provider: ProviderName
  category: ModelCategory
  contextWindow: number
  inputPerMillion: number
  outputPerMillion: number
}

export type RunStats = {
  runId: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

export type SlotStatus = "idle" | "streaming" | "done" | "error"

export type CompareSlotState = {
  model: string
  output: string
  status: SlotStatus
  stats?: RunStats
  error?: string
}
