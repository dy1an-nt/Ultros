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

  const dataset = await prisma.dataset.findUnique({ where: { id } })
  if (!dataset) return errorResponse("NOT_FOUND")
  if (dataset.userId !== user.id) return errorResponse("FORBIDDEN")

  const runs = await prisma.datasetRun.findMany({
    where: { datasetId: id },
    orderBy: { createdAt: "desc" },
  })
  return jsonOk(runs)
}
