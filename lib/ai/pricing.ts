import { getModelInfo } from "./models"

// verified as of 2026-06-09
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const info = getModelInfo(model)
  if (!info) return 0
  return (
    (inputTokens / 1_000_000) * info.inputPerMillion +
    (outputTokens / 1_000_000) * info.outputPerMillion
  )
}
