import { calculateCost } from "@/lib/ai/pricing"
import { interpolateVariables } from "@/lib/ai"

export type EstimateInput = {
  model: string
  maxTokens: number
  systemPrompt: string
  userPrompt: string
  variableMapping: Record<string, string>
  rows: { data: Record<string, string> }[]
}

export type Estimate = {
  rowCount: number
  estimatedInputTokens: number
  estimatedCostUsd: number
  perRowCapUsd: number
}

// ~4 chars per token is close enough for a pre-launch sanity number.
// Output is costed at the full maxTokens cap, so the estimate is an upper
// bound — a wallet guard should never under-promise.
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function estimateDatasetRun(input: EstimateInput): Estimate {
  let totalInputTokens = 0
  let maxRowInputTokens = 0

  for (const row of input.rows) {
    const variables: Record<string, string> = {}
    for (const [templateVar, column] of Object.entries(input.variableMapping)) {
      variables[templateVar] = row.data[column] ?? ""
    }
    const rowTokens =
      approxTokens(interpolateVariables(input.systemPrompt, variables)) +
      approxTokens(interpolateVariables(input.userPrompt, variables))
    totalInputTokens += rowTokens
    maxRowInputTokens = Math.max(maxRowInputTokens, rowTokens)
  }

  const rowCount = input.rows.length
  return {
    rowCount,
    estimatedInputTokens: totalInputTokens,
    estimatedCostUsd: calculateCost(input.model, totalInputTokens, rowCount * input.maxTokens),
    perRowCapUsd: calculateCost(input.model, maxRowInputTokens, input.maxTokens),
  }
}

// Every {{var}} in the version's prompts, deduped, trimmed.
export function extractTemplateVariables(systemPrompt: string, userPrompt: string): string[] {
  const found = new Set<string>()
  for (const match of `${systemPrompt}\n${userPrompt}`.matchAll(/\{\{([^}]+)\}\}/g)) {
    found.add(match[1].trim())
  }
  return [...found]
}

// Returns an error message, or null if every template var maps to a real column.
export function validateMapping(
  templateVars: string[],
  mapping: Record<string, string>,
  columns: string[]
): string | null {
  const unmapped = templateVars.filter((v) => !(v in mapping))
  if (unmapped.length > 0) return `unmapped template variables: ${unmapped.join(", ")}`
  for (const [templateVar, column] of Object.entries(mapping)) {
    if (!columns.includes(column)) {
      return `variable "${templateVar}" maps to unknown column "${column}"`
    }
  }
  return null
}
