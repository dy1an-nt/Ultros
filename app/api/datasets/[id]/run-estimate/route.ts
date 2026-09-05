import { prisma } from "@/lib/prisma"
import { estimateDatasetRun } from "@/lib/datasets/estimate"
import { loadRunRequest } from "@/lib/datasets/runRequest"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const POST = withUser<{ id: string }>(async ({ req, params, user }) => {
  const body = await readJson(req)

  const loaded = await loadRunRequest(user.id, params.id, body)
  if (loaded.value === null) {
    throw new ApiError(loaded.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", loaded.error)
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
})
