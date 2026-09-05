import { prisma } from "@/lib/prisma"
import { toBaselineDto } from "@/lib/regression/baseline"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  const prompt = await db.prompt.requireHidden(params.id)

  const baseline = await prisma.baseline.findUnique({ where: { promptId: prompt.id } })
  if (!baseline) {
    throw new ApiError("NOT_FOUND", "no baseline set for this prompt")
  }
  return jsonOk(await toBaselineDto(baseline))
})

// A baseline is set by pointing at an existing complete DatasetRun of the
// version (architect pin: cheaper than launching a fresh run, and the user
// blesses numbers they have already seen).
export const POST = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ req, params, user, db }) => {
    const prompt = await db.prompt.requireHidden(params.id)
    const body = await readJson(req)

    const { promptVersionId, datasetRunId } = body
    if (typeof promptVersionId !== "string" || !promptVersionId) {
      throw new ApiError("VALIDATION_ERROR", "promptVersionId is required")
    }
    if (typeof datasetRunId !== "string" || !datasetRunId) {
      throw new ApiError("VALIDATION_ERROR", "datasetRunId is required")
    }

    const version = await prisma.promptVersion.findUnique({ where: { id: promptVersionId } })
    if (!version || version.promptId !== prompt.id) {
      throw new ApiError("VALIDATION_ERROR", "invalid promptVersionId")
    }

    const run = await db.datasetRun.requireRef(datasetRunId, "datasetRunId")
    if (run.promptVersionId !== version.id) {
      throw new ApiError("VALIDATION_ERROR", "datasetRunId does not belong to the given promptVersionId")
    }
    if (run.status !== "complete") {
      throw new ApiError("VALIDATION_ERROR", "baseline run must be complete")
    }
    if (run.rubricId === null || run.avgScore === null || run.passRate === null) {
      throw new ApiError("VALIDATION_ERROR", "baseline run must be scored against a rubric")
    }

    const data = {
      userId: user.id,
      promptVersionId: version.id,
      datasetId: run.datasetId,
      rubricId: run.rubricId,
      datasetRunId: run.id,
      baselineScore: run.avgScore,
      baselinePassRate: run.passRate,
      setAt: new Date(),
    }
    // One active baseline per prompt, re-POST replaces it (and its regression
    // history goes stale against the new anchor, so the cascade is on delete only).
    const baseline = await prisma.baseline.upsert({
      where: { promptId: prompt.id },
      create: { promptId: prompt.id, ...data },
      update: data,
    })

    return jsonOk(await toBaselineDto(baseline), 201)
  }
)

export const DELETE = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ params, db }) => {
    const prompt = await db.prompt.requireHidden(params.id)

    const baseline = await prisma.baseline.findUnique({ where: { promptId: prompt.id } })
    if (!baseline) {
      throw new ApiError("NOT_FOUND", "no baseline set for this prompt")
    }
    // Cascade removes the regression history. It is meaningless without its anchor.
    await prisma.baseline.delete({ where: { id: baseline.id } })
    return jsonOk({ id: baseline.id })
  }
)
