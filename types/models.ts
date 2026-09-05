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
  // False on models that removed temperature/top_p; the run sends no sampling
  // parameters at all, so the UI must not offer a knob for them.
  supportsSampling: boolean
  thinksByDefault: boolean
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
