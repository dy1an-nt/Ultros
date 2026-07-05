import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse, jsonOk } from "@/lib/api/errors"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await getDbUser(clerkId)
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const version = await prisma.promptVersion.findUnique({
    where: { id: versionId },
    include: { prompt: { select: { userId: true } } },
  })

  if (!version || version.promptId !== id) {
    return errorResponse("NOT_FOUND")
  }
  if (version.prompt.userId !== user.id) {
    return errorResponse("FORBIDDEN")
  }

  return jsonOk(version)
}
