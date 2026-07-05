import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse, jsonOk } from "@/lib/api/errors"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const evaluation = await prisma.evaluation.findUnique({ where: { id } })
  if (!evaluation) return errorResponse("NOT_FOUND")
  if (evaluation.userId !== user.id) {
    return errorResponse("FORBIDDEN")
  }

  return jsonOk(evaluation)
}
