import { generateObject } from "ai"
import { z } from "zod"
import { resolveProvider } from "@/lib/ai/router"
import { isModelAvailable } from "@/lib/ai/models"
import { calculateCost } from "@/lib/ai/pricing"
import type { AiJudgeConfig, Criterion, CriterionScore } from "@/types/eval"

const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5"

export function getJudgeModel(): string {
  const model = process.env.JUDGE_MODEL || DEFAULT_JUDGE_MODEL
  if (!isModelAvailable(model)) {
    throw new Error(`Judge model "${model}" is not available`)
  }
  return model
}

const judgeOutputSchema = z.object({
  criteria: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(0).max(1),
      reasoning: z.string(),
    })
  ),
})

export type JudgeResult = {
  scores: CriterionScore[]
  reasoning: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

// One generateObject call covering all ai_judge criteria — cheaper than one
// call per criterion and internally consistent. temperature pinned to 0.
export async function judgeCriteria(criteria: Criterion[], responseText: string): Promise<JudgeResult> {
  const model = getJudgeModel()

  const criteriaList = criteria
    .map((c, i) => {
      const config = c.config as AiJudgeConfig
      return `${i + 1}. name: ${JSON.stringify(c.name)}\n   instructions: ${config.instructions}`
    })
    .join("\n")

  const { object, usage } = await generateObject({
    model: resolveProvider(model),
    schema: judgeOutputSchema,
    temperature: 0,
    system:
      "You are a strict evaluation judge. Score an AI response against each criterion. " +
      "For every criterion return its exact name, a score between 0 and 1 (inclusive), " +
      "and a one-sentence reasoning. Follow each criterion's instructions exactly.",
    prompt: `Criteria to evaluate:\n${criteriaList}\n\nResponse to evaluate:\n<response>\n${responseText}\n</response>\n\nScore every criterion listed above, using the exact criterion names.`,
  })

  const byName = new Map(object.criteria.map((c) => [c.name, c]))
  const scores: CriterionScore[] = criteria.map((c) => {
    const judged = byName.get(c.name)
    return {
      name: c.name,
      type: c.type,
      weight: c.weight,
      score: judged ? clamp01(judged.score) : 0,
      detail: judged?.reasoning ?? "judge did not return a score for this criterion",
    }
  })

  const reasoning = criteria
    .map((c) => `${c.name}: ${byName.get(c.name)?.reasoning ?? "no reasoning returned"}`)
    .join("\n")

  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0

  return {
    scores,
    reasoning,
    model,
    inputTokens,
    outputTokens,
    costUsd: calculateCost(model, inputTokens, outputTokens),
  }
}
