import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { validateCriteria, validatePassThreshold, validateRubricName } from "@/lib/eval/criteria"
import { errorResponse, jsonOk } from "@/lib/api/errors"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const rubrics = await prisma.rubric.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  return jsonOk(rubrics)
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }

  const { value: name, error: nameError } = validateRubricName(body.name)
  if (name === null) return errorResponse("VALIDATION_ERROR", nameError)

  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    return errorResponse("VALIDATION_ERROR", "description: must be a string")
  }

  const { value: passThreshold, error: thresholdError } = validatePassThreshold(body.passThreshold)
  if (passThreshold === null) return errorResponse("VALIDATION_ERROR", thresholdError)

  const { criteria, error: criteriaError } = validateCriteria(body.criteria)
  if (criteria === null) return errorResponse("VALIDATION_ERROR", criteriaError)

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
}
