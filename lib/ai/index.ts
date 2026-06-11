import { streamText } from "ai"
import { resolveProvider } from "./router"
import { getAvailableModels, type ModelInfo } from "./models"

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
  return streamText({
    model: resolveProvider(params.model),
    system: params.systemPrompt || undefined,
    prompt: params.userPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    topP: params.topP,
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
