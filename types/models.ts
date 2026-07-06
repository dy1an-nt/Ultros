export type ProviderName = "anthropic" | "openai" | "google" | "openrouter" | "ollama"
export type ModelCategory = "direct" | "openrouter" | "local"

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
  // null when generation succeeded but the run row failed to persist
  runId: string | null
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
