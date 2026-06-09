// verified as of 2026-06-09
export type ModelCategory = "direct" | "openrouter"
export type ProviderName = "anthropic" | "openai" | "google" | "openrouter"

export type ModelInfo = {
  id: string
  displayName: string
  provider: ProviderName
  category: ModelCategory
  contextWindow: number
  inputPerMillion: number
  outputPerMillion: number
}

export const MODEL_CATALOG: ModelInfo[] = [
  // Anthropic (direct)
  { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", provider: "anthropic", category: "direct", contextWindow: 200000, inputPerMillion: 1.00, outputPerMillion: 5.00 },
  { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", provider: "anthropic", category: "direct", contextWindow: 200000, inputPerMillion: 3.00, outputPerMillion: 15.00 },
  { id: "claude-opus-4-7", displayName: "Claude Opus 4.7", provider: "anthropic", category: "direct", contextWindow: 200000, inputPerMillion: 15.00, outputPerMillion: 75.00 },
  // OpenAI (direct)
  { id: "gpt-4o-mini", displayName: "GPT-4o Mini", provider: "openai", category: "direct", contextWindow: 128000, inputPerMillion: 0.15, outputPerMillion: 0.60 },
  { id: "gpt-4o", displayName: "GPT-4o", provider: "openai", category: "direct", contextWindow: 128000, inputPerMillion: 2.50, outputPerMillion: 10.00 },
  { id: "gpt-4.1", displayName: "GPT-4.1", provider: "openai", category: "direct", contextWindow: 1000000, inputPerMillion: 2.00, outputPerMillion: 8.00 },
  // Google Gemini (direct)
  { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", provider: "google", category: "direct", contextWindow: 1000000, inputPerMillion: 0.10, outputPerMillion: 0.40 },
  { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google", category: "direct", contextWindow: 1000000, inputPerMillion: 1.25, outputPerMillion: 10.00 },
  // OpenRouter (long-tail)
  { id: "mistralai/mistral-7b-instruct", displayName: "Mistral 7B Instruct", provider: "openrouter", category: "openrouter", contextWindow: 32768, inputPerMillion: 0.07, outputPerMillion: 0.07 },
  { id: "mistralai/mixtral-8x7b-instruct", displayName: "Mixtral 8x7B", provider: "openrouter", category: "openrouter", contextWindow: 32768, inputPerMillion: 0.24, outputPerMillion: 0.24 },
  { id: "meta-llama/llama-3.1-8b-instruct", displayName: "Llama 3.1 8B", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 0.06, outputPerMillion: 0.06 },
  { id: "meta-llama/llama-3.3-70b-instruct", displayName: "Llama 3.3 70B", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 0.30, outputPerMillion: 0.30 },
  { id: "deepseek/deepseek-r1", displayName: "DeepSeek R1", provider: "openrouter", category: "openrouter", contextWindow: 64000, inputPerMillion: 0.55, outputPerMillion: 2.19 },
  { id: "qwen/qwen-2.5-72b-instruct", displayName: "Qwen 2.5 72B", provider: "openrouter", category: "openrouter", contextWindow: 32000, inputPerMillion: 0.35, outputPerMillion: 0.40 },
  { id: "cohere/command-r-plus", displayName: "Cohere Command R+", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 2.50, outputPerMillion: 10.00 },
  { id: "nousresearch/hermes-3-llama-3.1-70b", displayName: "Hermes 3 70B", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 0.40, outputPerMillion: 0.40 },
]

const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
}

function isProviderConfigured(provider: ProviderName): boolean {
  return Boolean(process.env[PROVIDER_ENV_KEYS[provider]])
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId)
}

// Only models whose provider API key is configured — advertising the rest
// guarantees runtime failures when a user selects them.
export function getAvailableModels(): ModelInfo[] {
  return MODEL_CATALOG.filter((m) => isProviderConfigured(m.provider))
}

export function isModelAvailable(modelId: string): boolean {
  const info = getModelInfo(modelId)
  return info !== undefined && isProviderConfigured(info.provider)
}
