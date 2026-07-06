import type { LanguageModel } from "ai"
import { getModelInfo } from "./models"
import { anthropic } from "./providers/claude"
import { openai } from "./providers/openai"
import { google } from "./providers/gemini"
import { openrouter } from "./providers/openrouter"
import { ollama } from "./providers/ollama"

export function resolveProvider(modelId: string): LanguageModel {
  const info = getModelInfo(modelId)
  if (!info) throw new Error(`Unknown model: ${modelId}`)
  switch (info.provider) {
    case "anthropic":  return anthropic(modelId)
    case "openai":     return openai(modelId)
    case "google":     return google(modelId)
    case "openrouter": return openrouter(modelId)
    case "ollama":     return ollama(modelId)
  }
}
