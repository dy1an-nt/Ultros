import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { validateCriteria, validatePassThreshold, validateRubricName } from "@/lib/eval/criteria"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser(async ({ db }) => {
  return jsonOk(await db.rubric.list())
})

export const POST = withUser({ rateLimit: "mutation" }, async ({ req, user }) => {
  const body = await readJson(req)

  const { value: name, error: nameError } = validateRubricName(body.name)
  if (name === null) throw new ApiError("VALIDATION_ERROR", nameError)

  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    throw new ApiError("VALIDATION_ERROR", "description: must be a string")
  }

  const { value: passThreshold, error: thresholdError } = validatePassThreshold(body.passThreshold)
  if (passThreshold === null) throw new ApiError("VALIDATION_ERROR", thresholdError)

  const { criteria, error: criteriaError } = validateCriteria(body.criteria)
  if (criteria === null) throw new ApiError("VALIDATION_ERROR", criteriaError)

  const rubric = await prisma.rubric.create({
    data: {
      userId: user.id,
      name,
      description: (body.description as string | null | undefined) ?? null,
      // Criterion["config"] uses Record<string, unknown>, which Prisma's JSON
      // input type can't verify structurally, validated by validateCriteria above.
      criteria: criteria as unknown as Prisma.InputJsonValue,
      passThreshold,
    },
  })

  return jsonOk(rubric, 201)
})
