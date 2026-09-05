// Context windows and capability flags verified against GET /v1/models on
// 2026-09-04; prices verified as of 2026-09-04.
//
// MODEL_CATALOG is imported by the public /docs page so the published prices
// come from the same constant the biller reads. Nothing secret may live in
// this module: the only environment access below is a computed lookup of
// variable *names*, which the bundler cannot inline a value for.
export type ModelCategory = "direct" | "openrouter" | "local"
export type ProviderName = "anthropic" | "openai" | "google" | "openrouter" | "ollama"

export type ModelInfo = {
  id: string
  displayName: string
  provider: ProviderName
  category: ModelCategory
  contextWindow: number
  inputPerMillion: number
  outputPerMillion: number
  // Anthropic removed temperature/top_p/top_k on Opus 4.7 and the 5 series;
  // sending one is a 400, not a warning. Run paths drop the sampling
  // parameters when this is false rather than advertising a knob that lies.
  supportsSampling: boolean
  // Extended thinking runs unless it is explicitly disabled, and the thinking
  // tokens are charged against the same max_tokens ceiling as the answer.
  // Without headroom a reasoning-heavy prompt stops mid-sentence.
  thinksByDefault: boolean
}

// Thinking tokens share the caller's output budget, so a model that thinks
// needs room beyond the answer length the user asked for. An allowance, not a
// guarantee: a long enough chain of thought can still reach the ceiling.
export const THINKING_TOKEN_HEADROOM = 4096

export const MODEL_CATALOG: ModelInfo[] = [
  // Anthropic (direct)
  { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", provider: "anthropic", category: "direct", contextWindow: 200000, inputPerMillion: 1.00, outputPerMillion: 5.00, supportsSampling: true, thinksByDefault: false },
  { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", provider: "anthropic", category: "direct", contextWindow: 1000000, inputPerMillion: 3.00, outputPerMillion: 15.00, supportsSampling: true, thinksByDefault: false },
  { id: "claude-sonnet-5", displayName: "Claude Sonnet 5", provider: "anthropic", category: "direct", contextWindow: 1000000, inputPerMillion: 2.00, outputPerMillion: 10.00, supportsSampling: false, thinksByDefault: true },
  { id: "claude-opus-4-7", displayName: "Claude Opus 4.7", provider: "anthropic", category: "direct", contextWindow: 1000000, inputPerMillion: 5.00, outputPerMillion: 25.00, supportsSampling: false, thinksByDefault: false },
  { id: "claude-opus-5", displayName: "Claude Opus 5", provider: "anthropic", category: "direct", contextWindow: 1000000, inputPerMillion: 5.00, outputPerMillion: 25.00, supportsSampling: false, thinksByDefault: true },
  { id: "claude-fable-5-1", displayName: "Claude Fable 5.1", provider: "anthropic", category: "direct", contextWindow: 1000000, inputPerMillion: 10.00, outputPerMillion: 50.00, supportsSampling: false, thinksByDefault: true },
  // OpenAI (direct)
  { id: "gpt-4o-mini", displayName: "GPT-4o Mini", provider: "openai", category: "direct", contextWindow: 128000, inputPerMillion: 0.15, outputPerMillion: 0.60, supportsSampling: true, thinksByDefault: false },
  { id: "gpt-4o", displayName: "GPT-4o", provider: "openai", category: "direct", contextWindow: 128000, inputPerMillion: 2.50, outputPerMillion: 10.00, supportsSampling: true, thinksByDefault: false },
  { id: "gpt-4.1", displayName: "GPT-4.1", provider: "openai", category: "direct", contextWindow: 1000000, inputPerMillion: 2.00, outputPerMillion: 8.00, supportsSampling: true, thinksByDefault: false },
  // Google Gemini (direct)
  { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", provider: "google", category: "direct", contextWindow: 1000000, inputPerMillion: 0.10, outputPerMillion: 0.40, supportsSampling: true, thinksByDefault: false },
  { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google", category: "direct", contextWindow: 1000000, inputPerMillion: 1.25, outputPerMillion: 10.00, supportsSampling: true, thinksByDefault: false },
  // OpenRouter (long-tail)
  { id: "mistralai/mistral-7b-instruct", displayName: "Mistral 7B Instruct", provider: "openrouter", category: "openrouter", contextWindow: 32768, inputPerMillion: 0.07, outputPerMillion: 0.07, supportsSampling: true, thinksByDefault: false },
  { id: "mistralai/mixtral-8x7b-instruct", displayName: "Mixtral 8x7B", provider: "openrouter", category: "openrouter", contextWindow: 32768, inputPerMillion: 0.24, outputPerMillion: 0.24, supportsSampling: true, thinksByDefault: false },
  { id: "meta-llama/llama-3.1-8b-instruct", displayName: "Llama 3.1 8B", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 0.06, outputPerMillion: 0.06, supportsSampling: true, thinksByDefault: false },
  { id: "meta-llama/llama-3.3-70b-instruct", displayName: "Llama 3.3 70B", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 0.30, outputPerMillion: 0.30, supportsSampling: true, thinksByDefault: false },
  { id: "deepseek/deepseek-r1", displayName: "DeepSeek R1", provider: "openrouter", category: "openrouter", contextWindow: 64000, inputPerMillion: 0.55, outputPerMillion: 2.19, supportsSampling: true, thinksByDefault: true },
  { id: "qwen/qwen-2.5-72b-instruct", displayName: "Qwen 2.5 72B", provider: "openrouter", category: "openrouter", contextWindow: 32000, inputPerMillion: 0.35, outputPerMillion: 0.40, supportsSampling: true, thinksByDefault: false },
  { id: "cohere/command-r-plus", displayName: "Cohere Command R+", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 2.50, outputPerMillion: 10.00, supportsSampling: true, thinksByDefault: false },
  { id: "nousresearch/hermes-3-llama-3.1-70b", displayName: "Hermes 3 70B", provider: "openrouter", category: "openrouter", contextWindow: 128000, inputPerMillion: 0.40, outputPerMillion: 0.40, supportsSampling: true, thinksByDefault: false },
  // Ollama (local inference, $0, dev only; hidden unless OLLAMA_BASE_URL is set)
  { id: "qwen3:8b", displayName: "Qwen 3 8B (local)", provider: "ollama", category: "local", contextWindow: 40960, inputPerMillion: 0, outputPerMillion: 0, supportsSampling: true, thinksByDefault: true },
]

const PROVIDER_ENV_KEYS: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  // Not a key. Presence of the base URL is what marks local inference as
  // available, so local models never surface in production deployments.
  ollama: "OLLAMA_BASE_URL",
}

function isProviderConfigured(provider: ProviderName): boolean {
  return Boolean(process.env[PROVIDER_ENV_KEYS[provider]])
}

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId)
}

// Only models whose provider API key is configured, advertising the rest
// guarantees runtime failures when a user selects them.
export function getAvailableModels(): ModelInfo[] {
  return MODEL_CATALOG.filter((m) => isProviderConfigured(m.provider))
}

export function isModelAvailable(modelId: string): boolean {
  const info = getModelInfo(modelId)
  return info !== undefined && isProviderConfigured(info.provider)
}

export function supportsSampling(modelId: string): boolean {
  // Unknown ids reach the provider as-is; assume the common case rather than
  // silently stripping a parameter the caller asked for.
  return getModelInfo(modelId)?.supportsSampling ?? true
}

// The ceiling to send the provider so the user still gets the output length
// they asked for after thinking has taken its share.
export function outputTokenBudget(modelId: string, requestedMaxTokens: number): number {
  return getModelInfo(modelId)?.thinksByDefault
    ? requestedMaxTokens + THINKING_TOKEN_HEADROOM
    : requestedMaxTokens
}
