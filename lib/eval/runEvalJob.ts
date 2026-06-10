import { prisma } from "@/lib/prisma"
import type { CriteriaSnapshot, CriterionScore } from "@/types/eval"
import { finalizeIfDone } from "@/lib/datasets/finalize"
import { judgeCriteria } from "./judge"
import { computeTotalScore } from "./matchers"

// Provider error messages can echo request headers; never persist an API key.
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message
  for (const envKey of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "OPENROUTER_API_KEY",
    "UPSTASH_QSTASH_TOKEN",
  ]) {
    const value = process.env[envKey]
    if (value) sanitized = sanitized.split(value).join("[redacted]")
  }
  return sanitized.slice(0, 2000)
}

// Async eval job body: claim → judge → merge → complete (or fail).
// Idempotent under QStash retries via the claim transition: `complete` is the
// only terminal state; a claim that matches 0 rows means the work is done.
export async function runEvalJob(evaluationId: string): Promise<void> {
  const claimed = await prisma.evaluation.updateMany({
    where: { id: evaluationId, status: { in: ["pending", "running", "failed"] } },
    data: { status: "running", error: null },
  })
  if (claimed.count === 0) return // already complete (or nonexistent) — no-op

  try {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { promptRun: { select: { responseText: true, datasetRunId: true } } },
    })
    if (!evaluation) return
    const datasetRunId = evaluation.promptRun.datasetRunId

    const snapshot = evaluation.criteriaSnapshot as unknown as CriteriaSnapshot
    const deterministicScores = (evaluation.criteriaScores as unknown as CriterionScore[] | null) ?? []
    const aiCriteria = snapshot.criteria.filter((c) => c.type === "ai_judge")

    let mergedScores: CriterionScore[]
    let judgeFields: {
      aiEvalReasoning?: string
      judgeModel?: string
      judgeInputTokens?: number
      judgeOutputTokens?: number
      judgeCostUsd?: number
    } = {}

    if (aiCriteria.length === 0) {
      mergedScores = deterministicScores
    } else {
      const judge = await judgeCriteria(aiCriteria, evaluation.promptRun.responseText)
      const byName = new Map(
        [...deterministicScores, ...judge.scores].map((s) => [s.name, s])
      )
      // Preserve the rubric's criteria order in the merged result.
      mergedScores = snapshot.criteria
        .map((c) => byName.get(c.name))
        .filter((s): s is CriterionScore => s !== undefined)
      judgeFields = {
        aiEvalReasoning: judge.reasoning,
        judgeModel: judge.model,
        judgeInputTokens: judge.inputTokens,
        judgeOutputTokens: judge.outputTokens,
        judgeCostUsd: judge.costUsd,
      }

      // Judge usage rolls into UsageSummary tokens and cost only — a judge
      // call is not a user-initiated run, so totalRuns stays untouched.
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      await prisma.usageSummary.upsert({
        where: { userId_date: { userId: evaluation.userId, date: today } },
        create: {
          userId: evaluation.userId,
          date: today,
          totalRuns: 0,
          totalInputTokens: judge.inputTokens,
          totalOutputTokens: judge.outputTokens,
          totalCostUsd: judge.costUsd,
        },
        update: {
          totalInputTokens: { increment: judge.inputTokens },
          totalOutputTokens: { increment: judge.outputTokens },
          totalCostUsd: { increment: judge.costUsd },
        },
      })
    }

    const totalScore = computeTotalScore(mergedScores)
    const passed = totalScore >= snapshot.passThreshold

    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        status: "complete",
        totalScore,
        passed,
        criteriaScores: mergedScores,
        completedAt: new Date(),
        ...judgeFields,
      },
    })

    // Batch rows wait for their judge evals — this eval may be the last thing
    // holding its DatasetRun open.
    if (datasetRunId) await finalizeIfDone(datasetRunId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown eval job error"
    console.error(`Eval job ${evaluationId} failed:`, err)
    try {
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: { status: "failed", error: sanitizeErrorMessage(message) },
      })
      // A failed eval no longer blocks finalization — let its batch close out.
      const failed = await prisma.evaluation.findUnique({
        where: { id: evaluationId },
        select: { promptRun: { select: { datasetRunId: true } } },
      })
      if (failed?.promptRun.datasetRunId) await finalizeIfDone(failed.promptRun.datasetRunId)
    } catch (updateErr) {
      console.error(`Failed to mark evaluation ${evaluationId} as failed:`, updateErr)
    }
  }
}
