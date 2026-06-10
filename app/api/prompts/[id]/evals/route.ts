import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (prompt.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const limitParam = req.nextUrl.searchParams.get("limit")
  let limit = DEFAULT_LIMIT
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return Response.json({ data: null, error: "limit must be a positive integer" }, { status: 400 })
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

  return Response.json({ data, error: null })
}
