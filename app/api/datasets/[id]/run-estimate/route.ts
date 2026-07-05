import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { estimateDatasetRun } from "@/lib/datasets/estimate"
import { loadRunRequest } from "@/lib/datasets/runRequest"
import { errorResponse, jsonOk } from "@/lib/api/errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }

  const loaded = await loadRunRequest(user.id, id, body)
  if (loaded.value === null) {
    return errorResponse(loaded.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", loaded.error)
  }
  const { dataset, version, params: runParams, variableMapping } = loaded.value

  const rows = await prisma.datasetRow.findMany({
    where: { datasetId: dataset.id },
    select: { data: true },
    orderBy: { rowIndex: "asc" },
  })

  const estimate = estimateDatasetRun({
    model: runParams.model,
    maxTokens: runParams.maxTokens,
    systemPrompt: version.systemPrompt,
    userPrompt: version.userPrompt,
    variableMapping,
    rows: rows.map((r) => ({ data: r.data as Record<string, string> })),
  })

  return jsonOk(estimate)
}
