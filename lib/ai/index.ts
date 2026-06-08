import { streamText } from "ai"
import { anthropic } from "./providers/claude"

export type RunParams = {
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  maxOutputTokens: number
  topP?: number
}

const CLAUDE_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"]

export function runStream(params: RunParams) {
  if (!CLAUDE_MODELS.includes(params.model)) {
    throw new Error(`Unknown model: ${params.model}`)
  }
  return streamText({
    model: anthropic(params.model),
    system: params.systemPrompt || undefined,
    prompt: params.userPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    topP: params.topP,
  })
}

export function interpolateVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? "")
}
