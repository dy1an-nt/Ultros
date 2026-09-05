import { prisma } from "@/lib/prisma"
import { validateCriteria, validatePassThreshold, validateRubricName } from "@/lib/eval/criteria"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  return jsonOk(await db.rubric.require(params.id))
})

export const PATCH = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ req, params, db }) => {
    const rubric = await db.rubric.require(params.id)
    const body = await readJson(req)

    const data: {
      name?: string
      description?: string | null
      passThreshold?: number
      criteria?: object
    } = {}

    if (body.name !== undefined) {
      const { value, error: nameError } = validateRubricName(body.name)
      if (value === null) throw new ApiError("VALIDATION_ERROR", nameError)
      data.name = value
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        throw new ApiError("VALIDATION_ERROR", "description: must be a string")
      }
      data.description = body.description as string | null
    }
    if (body.passThreshold !== undefined) {
      const { value, error: thresholdError } = validatePassThreshold(body.passThreshold)
      if (value === null) throw new ApiError("VALIDATION_ERROR", thresholdError)
      data.passThreshold = value
    }
    if (body.criteria !== undefined) {
      // Criteria are replaced wholesale, no partial criterion merging.
      const { criteria, error: criteriaError } = validateCriteria(body.criteria)
      if (criteria === null) throw new ApiError("VALIDATION_ERROR", criteriaError)
      data.criteria = criteria
    }

    return jsonOk(await prisma.rubric.update({ where: { id: rubric.id }, data }))
  }
)

export const DELETE = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ params, db }) => {
    const rubric = await db.rubric.require(params.id)

    // Evaluations keep their criteriaSnapshot; rubricId becomes null via SetNull.
    await prisma.rubric.delete({ where: { id: rubric.id } })

    return jsonOk({ id: rubric.id })
  }
)
