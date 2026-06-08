import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const version = await prisma.promptVersion.findUnique({
    where: { id: versionId },
    include: { prompt: { select: { userId: true } } },
  })

  if (!version || version.promptId !== id) {
    return Response.json({ data: null, error: "Not found" }, { status: 404 })
  }
  if (version.prompt.userId !== user.id) {
    return Response.json({ data: null, error: "Forbidden" }, { status: 403 })
  }

  return Response.json({ data: version, error: null })
}
