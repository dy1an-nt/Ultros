import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse, jsonOk } from "@/lib/api/errors"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt || prompt.deletedAt !== null) return errorResponse("NOT_FOUND")
  if (prompt.userId !== user.id) return errorResponse("FORBIDDEN")

  const runs = await prisma.promptRun.findMany({
    where: { promptId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      promptVersion: { select: { versionNumber: true, label: true } },
    },
  })

  return jsonOk(runs)
}
