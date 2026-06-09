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
}

export function runStream(params: RunParams) {
  return streamText({
    model: resolveProvider(params.model),
    system: params.systemPrompt || undefined,
    prompt: params.userPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    topP: params.topP,
  })
}

export { getAvailableModels }

export function interpolateVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? "")
}
