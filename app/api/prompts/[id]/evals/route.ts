import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse, jsonOk } from "@/lib/api/errors"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null) return errorResponse("NOT_FOUND")
  if (prompt.userId !== user.id) return errorResponse("FORBIDDEN")

  const limitParam = req.nextUrl.searchParams.get("limit")
  let limit = DEFAULT_LIMIT
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return errorResponse("VALIDATION_ERROR", "limit must be a positive integer")
    }
    limit = Math.min(parsed, MAX_LIMIT)
  }

  const evaluations = await prisma.evaluation.findMany({
    where: { userId: user.id, promptRun: { promptId: id } },
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
}
