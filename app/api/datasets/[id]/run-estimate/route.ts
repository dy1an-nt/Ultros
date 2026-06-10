import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { estimateDatasetRun } from "@/lib/datasets/estimate"
import { loadRunRequest } from "@/lib/datasets/runRequest"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const loaded = await loadRunRequest(user.id, id, body)
  if (loaded.value === null) {
    return Response.json({ data: null, error: loaded.error }, { status: loaded.status })
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

  return Response.json({ data: estimate, error: null })
}
