import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchDatasetRunRows, parsePagination } from "@/lib/datasets/rowsQuery"
import { errorResponse, jsonOk } from "@/lib/api/errors"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const run = await prisma.datasetRun.findUnique({ where: { id } })
  if (!run) return errorResponse("NOT_FOUND")
  if (run.userId !== user.id) return errorResponse("FORBIDDEN")

  const pagination = parsePagination(req.nextUrl.searchParams)
  if ("error" in pagination) {
    return errorResponse("VALIDATION_ERROR", pagination.error)
  }

  const data = await fetchDatasetRunRows(id, pagination.offset, pagination.limit)
  return jsonOk(data)
}
