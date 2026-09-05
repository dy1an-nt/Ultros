import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { runDeterministicCriterion, computeTotalScore } from "@/lib/eval/matchers"
import { enqueueEvalJob } from "@/lib/eval/queue"
import type { Criterion, CriteriaSnapshot, CriterionScore, EvalMethod } from "@/types/eval"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const POST = withUser<{ runId: string }>(
  { rateLimit: "eval" },
  async ({ req, params, user, db }) => {
    const body = await readJson(req)
    const { rubricId } = body
    if (!rubricId || typeof rubricId !== "string") {
      throw new ApiError("VALIDATION_ERROR", "rubricId is required")
    }

    const run = await db.promptRun.require(params.runId)
    // 400 (not 404/403) for missing or foreign rubrics. Does not leak whether
    // another user's rubric id exists.
    const rubric = await db.rubric.requireRef(rubricId, "rubricId")

    const criteria = rubric.criteria as unknown as Criterion[]
    const aiCriteria = criteria.filter((c) => c.type === "ai_judge")
    const deterministicCriteria = criteria.filter((c) => c.type !== "ai_judge")

    const evalMethod: EvalMethod =
      aiCriteria.length === 0 ? "deterministic" : deterministicCriteria.length === 0 ? "ai_judge" : "mixed"

    // Snapshot the rubric at eval time, editing or deleting the rubric later
    // must never change the meaning of this evaluation (Sprint 5 baselines rely on it).
    const criteriaSnapshot: CriteriaSnapshot = {
      rubricName: rubric.name,
      passThreshold: rubric.passThreshold,
      criteria,
    }

    const deterministicScores: CriterionScore[] = deterministicCriteria.map((c) =>
      runDeterministicCriterion(c, run.responseText)
    )

    if (aiCriteria.length === 0) {
      const totalScore = computeTotalScore(deterministicScores)
      const passed = totalScore >= rubric.passThreshold
      const evaluation = await prisma.evaluation.create({
        data: {
          promptRunId: run.id,
          rubricId: rubric.id,
          userId: user.id,
          status: "complete",
          totalScore,
          passed,
          criteriaScores: deterministicScores,
          criteriaSnapshot: criteriaSnapshot as unknown as Prisma.InputJsonValue,
          evalMethod,
          completedAt: new Date(),
        },
      })
      return jsonOk(evaluation)
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        promptRunId: run.id,
        rubricId: rubric.id,
        userId: user.id,
        status: "pending",
        criteriaScores: deterministicScores,
        criteriaSnapshot: criteriaSnapshot as unknown as Prisma.InputJsonValue,
        evalMethod,
      },
    })

    await enqueueEvalJob(evaluation.id)

    return jsonOk(evaluation, 202)
  }
)
