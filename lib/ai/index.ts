import { streamText } from "ai"
import { resolveProvider } from "./router"
import { getAvailableModels, outputTokenBudget, supportsSampling, type ModelInfo } from "./models"

export type { ModelInfo }

export type RunParams = {
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  maxOutputTokens: number
  topP?: number
  abortSignal?: AbortSignal
  // Aborted streams never emit a finish event with usage, so callers that
  // need to persist partial output must accumulate it themselves.
  onTextDelta?: (delta: string) => void
  onAbort?: () => Promise<void> | void
}

export function runStream(params: RunParams) {
  // Models that dropped the sampling parameters reject them outright, so the
  // knob is omitted rather than sent and refused.
  const sampled = supportsSampling(params.model)
  return streamText({
    model: resolveProvider(params.model),
    system: params.systemPrompt || undefined,
    prompt: params.userPrompt,
    temperature: sampled ? params.temperature : undefined,
    maxOutputTokens: outputTokenBudget(params.model, params.maxOutputTokens),
    topP: sampled ? params.topP : undefined,
    abortSignal: params.abortSignal,
    onChunk: params.onTextDelta
      ? ({ chunk }) => {
          if (chunk.type === "text-delta") params.onTextDelta?.(chunk.text)
        }
      : undefined,
    onAbort: params.onAbort ? () => params.onAbort?.() : undefined,
  })
}

export { getAvailableModels }

export function interpolateVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? "")
}
