import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { validateCriteria, validatePassThreshold, validateRubricName } from "@/lib/eval/criteria"
import { errorResponse, jsonOk } from "@/lib/api/errors"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

async function getRubricForUser(id: string, userId: string) {
  const rubric = await prisma.rubric.findUnique({ where: { id } })
  if (!rubric) return { rubric: null, error: "not_found" as const }
  if (rubric.userId !== userId) return { rubric: null, error: "forbidden" as const }
  return { rubric, error: null }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const { rubric, error } = await getRubricForUser(id, user.id)
  if (error === "not_found") return errorResponse("NOT_FOUND")
  if (error === "forbidden") return errorResponse("FORBIDDEN")

  return jsonOk(rubric)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const { error } = await getRubricForUser(id, user.id)
  if (error === "not_found") return errorResponse("NOT_FOUND")
  if (error === "forbidden") return errorResponse("FORBIDDEN")

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }

  const data: {
    name?: string
    description?: string | null
    passThreshold?: number
    criteria?: object
  } = {}

  if (body.name !== undefined) {
    const { value, error: nameError } = validateRubricName(body.name)
    if (value === null) return errorResponse("VALIDATION_ERROR", nameError)
    data.name = value
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return errorResponse("VALIDATION_ERROR", "description: must be a string")
    }
    data.description = body.description as string | null
  }
  if (body.passThreshold !== undefined) {
    const { value, error: thresholdError } = validatePassThreshold(body.passThreshold)
    if (value === null) return errorResponse("VALIDATION_ERROR", thresholdError)
    data.passThreshold = value
  }
  if (body.criteria !== undefined) {
    // Criteria are replaced wholesale — no partial criterion merging.
    const { criteria, error: criteriaError } = validateCriteria(body.criteria)
    if (criteria === null) return errorResponse("VALIDATION_ERROR", criteriaError)
    data.criteria = criteria
  }

  const updated = await prisma.rubric.update({ where: { id }, data })

  return jsonOk(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const { error } = await getRubricForUser(id, user.id)
  if (error === "not_found") return errorResponse("NOT_FOUND")
  if (error === "forbidden") return errorResponse("FORBIDDEN")

  // Evaluations keep their criteriaSnapshot; rubricId becomes null via SetNull.
  await prisma.rubric.delete({ where: { id } })

  return jsonOk({ id })
}
