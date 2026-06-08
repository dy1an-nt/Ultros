// verified as of 2026-06-08
export const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "claude-haiku-4-5":  { inputPerMillion: 1.00,  outputPerMillion: 5.00  },
  "claude-sonnet-4-6": { inputPerMillion: 3.00,  outputPerMillion: 15.00 },
  "claude-opus-4-7":   { inputPerMillion: 15.00, outputPerMillion: 75.00 },
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  )
}
