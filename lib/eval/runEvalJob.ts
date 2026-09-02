import { prisma } from "@/lib/prisma"
import type { CriteriaSnapshot, CriterionScore } from "@/types/eval"
import { finalizeIfDone } from "@/lib/datasets/finalize"
import { judgeCriteria } from "./judge"
import { computeTotalScore } from "./matchers"
import { sanitizeErrorMessage } from "./sanitize"
import { logger } from "@/lib/logger"

// Re-exported for existing importers (e.g. lib/datasets/rowJob.ts). The
// implementation lives in ./sanitize so it stays unit-testable without Prisma.
export { sanitizeErrorMessage }

// How long a claimed-but-unfinished job is presumed alive before another
// delivery may reclaim it. Must exceed worst-case job latency (a judge LLM
// call is seconds); too short risks two workers running a slow job at once,
// too long delays recovery of a genuinely crashed worker.
export const EVAL_LEASE_MS = 5 * 60 * 1000

// Async eval job body: claim → judge → merge → complete (or fail).
//
// Idempotent under QStash at-least-once delivery. `complete` is the only
// terminal-success state and is never re-claimable. The claim is a *leased*
// transition: it matches a job only if it is pending/failed, or running with
// an expired (or never-set) lease. A row that another worker just stamped
// `running` is therefore NOT re-claimed. This closes the race where, under
// Postgres READ COMMITTED, two concurrent deliveries that both saw `running`
// in the claimable set would each proceed (double judge call, double usage
// increment, double completion write).
export async function runEvalJob(evaluationId: string): Promise<void> {
  const now = new Date()
  const leaseExpiry = new Date(now.getTime() - EVAL_LEASE_MS)
  const claimed = await prisma.evaluation.updateMany({
    where: {
      id: evaluationId,
      OR: [
        { status: { in: ["pending", "failed"] } },
        // Reclaim only a stalled run: the previous worker crashed and its
        // lease lapsed, or it predates the lease column (startedAt null).
        { status: "running", startedAt: { lt: leaseExpiry } },
        { status: "running", startedAt: null },
      ],
    },
    data: { status: "running", startedAt: now, error: null },
  })
  if (claimed.count === 0) return // complete, freshly-claimed, or nonexistent, no-op

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

      // Judge usage rolls into UsageSummary tokens and cost only, a judge
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

    // Batch rows wait for their judge evals. This eval may be the last thing
    // holding its DatasetRun open.
    if (datasetRunId) await finalizeIfDone(datasetRunId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown eval job error"
    // Sanitized only. Raw provider errors can echo request fragments or keys.
    const safe = sanitizeErrorMessage(message)
    logger.error("eval job failed", { evaluationId, error: safe })
    try {
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: { status: "failed", error: safe },
      })
      // A failed eval no longer blocks finalization. Let its batch close out.
      const failed = await prisma.evaluation.findUnique({
        where: { id: evaluationId },
        select: { promptRun: { select: { datasetRunId: true } } },
      })
      if (failed?.promptRun.datasetRunId) await finalizeIfDone(failed.promptRun.datasetRunId)
    } catch (updateErr) {
      logger.exception("failed to mark evaluation as failed", updateErr, { evaluationId })
    }
  }
}
