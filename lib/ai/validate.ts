import { getModelInfo, isModelAvailable } from "./models"

export const MAX_OUTPUT_TOKENS_LIMIT = 8192
export const DEFAULT_TEMPERATURE = 1.0
export const DEFAULT_MAX_TOKENS = 1024

export type ValidatedRunParams = {
  model: string
  temperature: number
  maxTokens: number
  topP: number | undefined
}

type ValidationResult =
  | { params: ValidatedRunParams; error: null }
  | { params: null; error: string }

export function validateRunParams(input: {
  model?: unknown
  temperature?: unknown
  maxTokens?: unknown
  topP?: unknown
}): ValidationResult {
  const { model, temperature, maxTokens, topP } = input

  if (typeof model !== "string" || !getModelInfo(model)) {
    return { params: null, error: `Unknown model: ${String(model)}` }
  }
  if (!isModelAvailable(model)) {
    return { params: null, error: `Model not available: ${model} (provider API key not configured)` }
  }

  let temp = DEFAULT_TEMPERATURE
  if (temperature !== undefined && temperature !== null) {
    if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return { params: null, error: "temperature must be a number between 0 and 2" }
    }
    temp = temperature
  }

  let tokens = DEFAULT_MAX_TOKENS
  if (maxTokens !== undefined && maxTokens !== null) {
    if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_OUTPUT_TOKENS_LIMIT) {
      return { params: null, error: `maxTokens must be an integer between 1 and ${MAX_OUTPUT_TOKENS_LIMIT}` }
    }
    tokens = maxTokens
  }

  let top: number | undefined
  if (topP !== undefined && topP !== null) {
    if (typeof topP !== "number" || !Number.isFinite(topP) || topP <= 0 || topP > 1) {
      return { params: null, error: "topP must be a number between 0 (exclusive) and 1" }
    }
    top = topP
  }

  return { params: { model, temperature: temp, maxTokens: tokens, topP: top }, error: null }
}

export function validateVariables(variables: unknown): Record<string, string> | null {
  if (variables === undefined || variables === null) return {}
  if (typeof variables !== "object" || Array.isArray(variables)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== "string") return null
    out[key] = value
  }
  return out
}
