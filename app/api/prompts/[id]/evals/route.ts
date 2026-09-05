import { prisma } from "@/lib/prisma"
import { withUser } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export const GET = withUser<{ id: string }>(async ({ req, params, db }) => {
  const prompt = await db.prompt.require(params.id)

  const limitParam = req.nextUrl.searchParams.get("limit")
  let limit = DEFAULT_LIMIT
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new ApiError("VALIDATION_ERROR", "limit must be a positive integer")
    }
    limit = Math.min(parsed, MAX_LIMIT)
  }

  const evaluations = await prisma.evaluation.findMany({
    where: { ...db.scope, promptRun: { promptId: prompt.id } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      promptRun: {
        select: {
          id: true,
          model: true,
          createdAt: true,
          promptVersionId: true,
          promptVersion: { select: { versionNumber: true } },
        },
      },
    },
  })

  const data = evaluations.map(({ promptRun, ...evaluation }) => ({
    ...evaluation,
    run: {
      id: promptRun.id,
      model: promptRun.model,
      createdAt: promptRun.createdAt,
      promptVersionId: promptRun.promptVersionId,
      versionNumber: promptRun.promptVersion.versionNumber,
    },
  }))

  return jsonOk(data)
})
