import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateCriteria, validatePassThreshold, validateRubricName } from "@/lib/eval/criteria"

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
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const { rubric, error } = await getRubricForUser(id, user.id)
  if (error === "not_found") return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (error === "forbidden") return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  return Response.json({ data: rubric, error: null })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const { error } = await getRubricForUser(id, user.id)
  if (error === "not_found") return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (error === "forbidden") return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const data: {
    name?: string
    description?: string | null
    passThreshold?: number
    criteria?: object
  } = {}

  if (body.name !== undefined) {
    const { value, error: nameError } = validateRubricName(body.name)
    if (value === null) return Response.json({ data: null, error: nameError }, { status: 400 })
    data.name = value
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return Response.json({ data: null, error: "description: must be a string" }, { status: 400 })
    }
    data.description = body.description as string | null
  }
  if (body.passThreshold !== undefined) {
    const { value, error: thresholdError } = validatePassThreshold(body.passThreshold)
    if (value === null) return Response.json({ data: null, error: thresholdError }, { status: 400 })
    data.passThreshold = value
  }
  if (body.criteria !== undefined) {
    // Criteria are replaced wholesale — no partial criterion merging.
    const { criteria, error: criteriaError } = validateCriteria(body.criteria)
    if (criteria === null) return Response.json({ data: null, error: criteriaError }, { status: 400 })
    data.criteria = criteria
  }

  const updated = await prisma.rubric.update({ where: { id }, data })

  return Response.json({ data: updated, error: null })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const { error } = await getRubricForUser(id, user.id)
  if (error === "not_found") return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (error === "forbidden") return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  // Evaluations keep their criteriaSnapshot; rubricId becomes null via SetNull.
  await prisma.rubric.delete({ where: { id } })

  return Response.json({ data: { id }, error: null })
}
