import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { runDeterministicCriterion, computeTotalScore } from "@/lib/eval/matchers"
import { enqueueEvalJob } from "@/lib/eval/queue"
import type { Criterion, CriteriaSnapshot, CriterionScore, EvalMethod } from "@/types/eval"
import { errorResponse, jsonOk } from "@/lib/api/errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("eval", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }
  const { rubricId } = body
  if (!rubricId || typeof rubricId !== "string") {
    return errorResponse("VALIDATION_ERROR", "rubricId is required")
  }

  const run = await prisma.promptRun.findUnique({ where: { id: runId } })
  if (!run) return errorResponse("NOT_FOUND")
  if (run.userId !== user.id) return errorResponse("FORBIDDEN")

  // 400 (not 404/403) for missing or foreign rubrics. Does not leak whether
  // another user's rubric id exists.
  const rubric = await prisma.rubric.findUnique({ where: { id: rubricId } })
  if (!rubric || rubric.userId !== user.id) {
    return errorResponse("VALIDATION_ERROR", "invalid rubricId")
  }

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
