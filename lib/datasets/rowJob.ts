import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/app/generated/prisma/client"
import { generate } from "@/lib/ai/generate"
import { interpolateVariables } from "@/lib/ai"
import { getModelInfo } from "@/lib/ai/models"
import { runDeterministicCriterion, computeTotalScore } from "@/lib/eval/matchers"
import { runEvalJob, sanitizeErrorMessage } from "@/lib/eval/runEvalJob"
import type { Criterion, CriteriaSnapshot, CriterionScore, EvalMethod } from "@/types/eval"
import { finalizeIfDone } from "./finalize"

async function incrementUsage(userId: string, inputTokens: number, outputTokens: number, costUsd: number) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  await prisma.usageSummary.upsert({
    where: { userId_date: { userId, date: today } },
    create: {
      userId,
      date: today,
      totalRuns: 1,
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalCostUsd: costUsd,
    },
    update: {
      totalRuns: { increment: 1 },
      totalInputTokens: { increment: inputTokens },
      totalOutputTokens: { increment: outputTokens },
      totalCostUsd: { increment: costUsd },
    },
  })
}

// One dataset row: generate → persist PromptRun → auto-eval → finalize check.
// QStash dedup ids are best-effort; the (datasetRunId, datasetRowId) PromptRun
// lookup is the idempotency guarantee.
export async function runDatasetRowJob(datasetRunId: string, rowIndex: number): Promise<void> {
  const run = await prisma.datasetRun.findUnique({ where: { id: datasetRunId } })
  if (!run || run.status === "complete" || run.status === "failed") return

  const row = await prisma.datasetRow.findUnique({
    where: { datasetId_rowIndex: { datasetId: run.datasetId, rowIndex } },
  })
  if (!row) return

  const existing = await prisma.promptRun.findFirst({
    where: { datasetRunId, datasetRowId: row.id },
    select: { id: true },
  })
  if (existing) return // duplicate delivery — work already done

  await prisma.datasetRun.updateMany({
    where: { id: datasetRunId, status: "pending" },
    data: { status: "running" },
  })

  const version = await prisma.promptVersion.findUnique({ where: { id: run.promptVersionId } })
  if (!version) return

  const mapping = run.variableMapping as Record<string, string>
  const rowData = row.data as Record<string, string>
  const variables: Record<string, string> = {}
  for (const [templateVar, column] of Object.entries(mapping)) {
    variables[templateVar] = rowData[column] ?? ""
  }

  const baseRun = {
    promptVersionId: version.id,
    promptId: version.promptId,
    userId: run.userId,
    datasetRowId: row.id,
    datasetRunId,
    model: run.model,
    temperature: run.temperature,
    maxTokens: run.maxTokens,
  }

  const start = Date.now()
  let promptRunId: string
  let responseText: string
  try {
    const result = await generate({
      model: run.model,
      systemPrompt: interpolateVariables(version.systemPrompt, variables),
      userPrompt: interpolateVariables(version.userPrompt, variables),
      temperature: run.temperature,
      maxOutputTokens: run.maxTokens,
    })
    const created = await prisma.promptRun.create({
      data: {
        ...baseRun,
        provider: result.provider,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        responseText: result.text,
        finishReason: result.finishReason,
      },
    })
    promptRunId = created.id
    responseText = result.text
    await incrementUsage(run.userId, result.inputTokens, result.outputTokens, result.costUsd)
    await prisma.datasetRun.update({
      where: { id: datasetRunId },
      data: { completedRows: { increment: 1 }, totalCostUsd: { increment: result.costUsd } },
    })
  } catch (err) {
    // Unique violation on (datasetRunId, datasetRowId): a concurrent delivery
    // won the race and persisted this row — not a failure, just a no-op.
    if ((err as { code?: string }).code === "P2002") return

    // Failed rows are PromptRuns too (finishReason "error", sanitized message
    // as the text) so the drill-down stays uniform.
    const message = sanitizeErrorMessage(err instanceof Error ? err.message : "Unknown row error")
    await prisma.promptRun.create({
      data: {
        ...baseRun,
        provider: getModelInfo(run.model)?.provider ?? "unknown",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - start,
        costUsd: 0,
        responseText: message,
        finishReason: "error",
      },
    })
    await prisma.datasetRun.update({
      where: { id: datasetRunId },
      data: { failedRows: { increment: 1 } },
    })
    await finalizeIfDone(datasetRunId)
    return
  }

  if (run.rubricId) {
    // Rubric deleted mid-batch is survivable: the row simply goes unscored.
    const rubric = await prisma.rubric.findUnique({ where: { id: run.rubricId } })
    if (rubric && rubric.userId === run.userId) {
      const criteria = rubric.criteria as unknown as Criterion[]
      const aiCriteria = criteria.filter((c) => c.type === "ai_judge")
      const deterministicCriteria = criteria.filter((c) => c.type !== "ai_judge")
      const evalMethod: EvalMethod =
        aiCriteria.length === 0 ? "deterministic" : deterministicCriteria.length === 0 ? "ai_judge" : "mixed"
      const criteriaSnapshot: CriteriaSnapshot = {
        rubricName: rubric.name,
        passThreshold: rubric.passThreshold,
        criteria,
      }
      const deterministicScores: CriterionScore[] = deterministicCriteria.map((c) =>
        runDeterministicCriterion(c, responseText)
      )

      if (aiCriteria.length === 0) {
        const totalScore = computeTotalScore(deterministicScores)
        await prisma.evaluation.create({
          data: {
            promptRunId,
            rubricId: rubric.id,
            userId: run.userId,
            status: "complete",
            totalScore,
            passed: totalScore >= rubric.passThreshold,
            criteriaScores: deterministicScores,
            criteriaSnapshot: criteriaSnapshot as unknown as Prisma.InputJsonValue,
            evalMethod,
            completedAt: new Date(),
          },
        })
      } else {
        const evaluation = await prisma.evaluation.create({
          data: {
            promptRunId,
            rubricId: rubric.id,
            userId: run.userId,
            status: "pending",
            criteriaScores: deterministicScores,
            criteriaSnapshot: criteriaSnapshot as unknown as Prisma.InputJsonValue,
            evalMethod,
          },
        })
        // Already inside a worker — run the judge inline, no second hop.
        await runEvalJob(evaluation.id)
      }
    }
  }

  await finalizeIfDone(datasetRunId)
}
