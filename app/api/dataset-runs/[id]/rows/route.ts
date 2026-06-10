import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchDatasetRunRows, parsePagination } from "@/lib/datasets/rowsQuery"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const run = await prisma.datasetRun.findUnique({ where: { id } })
  if (!run) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (run.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const pagination = parsePagination(req.nextUrl.searchParams)
  if ("error" in pagination) {
    return Response.json({ data: null, error: pagination.error }, { status: 400 })
  }

  const data = await fetchDatasetRunRows(id, pagination.offset, pagination.limit)
  return Response.json({ data, error: null })
}
