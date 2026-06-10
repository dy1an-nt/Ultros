import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { validateCriteria, validatePassThreshold, validateRubricName } from "@/lib/eval/criteria"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const rubrics = await prisma.rubric.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  return Response.json({ data: rubrics, error: null })
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const { value: name, error: nameError } = validateRubricName(body.name)
  if (name === null) return Response.json({ data: null, error: nameError }, { status: 400 })

  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    return Response.json({ data: null, error: "description: must be a string" }, { status: 400 })
  }

  const { value: passThreshold, error: thresholdError } = validatePassThreshold(body.passThreshold)
  if (passThreshold === null) return Response.json({ data: null, error: thresholdError }, { status: 400 })

  const { criteria, error: criteriaError } = validateCriteria(body.criteria)
  if (criteria === null) return Response.json({ data: null, error: criteriaError }, { status: 400 })

  const rubric = await prisma.rubric.create({
    data: {
      userId: user.id,
      name,
      description: (body.description as string | null | undefined) ?? null,
      // Criterion["config"] uses Record<string, unknown>, which Prisma's JSON
      // input type can't verify structurally — validated by validateCriteria above.
      criteria: criteria as unknown as Prisma.InputJsonValue,
      passThreshold,
    },
  })

  return Response.json({ data: rubric, error: null }, { status: 201 })
}
