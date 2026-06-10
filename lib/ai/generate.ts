import { generateText } from "ai"
import { resolveProvider } from "./router"
import { getModelInfo } from "./models"
import { calculateCost } from "./pricing"

export type GenerateParams = {
  model: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  maxOutputTokens: number
}

export type GenerateResult = {
  text: string
  finishReason: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  costUsd: number
  provider: string
}

// Non-streaming path for batch jobs — same routing and cost math as runStream,
// but the caller needs the finished result, not a stream.
export async function generate(params: GenerateParams): Promise<GenerateResult> {
  const start = Date.now()
  const result = await generateText({
    model: resolveProvider(params.model),
    system: params.systemPrompt || undefined,
    prompt: params.userPrompt,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
  })
  const latencyMs = Date.now() - start
  const inputTokens = result.usage.inputTokens ?? 0
  const outputTokens = result.usage.outputTokens ?? 0

  return {
    text: result.text,
    finishReason: result.finishReason,
    inputTokens,
    outputTokens,
    latencyMs,
    costUsd: calculateCost(params.model, inputTokens, outputTokens),
    provider: getModelInfo(params.model)?.provider ?? "unknown",
  }
}
