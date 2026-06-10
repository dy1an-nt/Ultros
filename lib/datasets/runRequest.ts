import { prisma } from "@/lib/prisma"
import { validateRunParams, validateVariables, type ValidatedRunParams } from "@/lib/ai/validate"
import { extractTemplateVariables, validateMapping } from "./estimate"

export const DATASET_RUN_MAX_TOKENS = 4096

type Loaded = {
  dataset: { id: string; columns: string[]; rowCount: number }
  version: { id: string; systemPrompt: string; userPrompt: string }
  params: ValidatedRunParams
  variableMapping: Record<string, string>
}

type Result = { value: Loaded; error: null; status: 0 } | { value: null; error: string; status: 400 | 404 }

// Shared by run-estimate and run launch: ownership, model/params, mapping.
// Omitted mapping defaults to identity for template vars that match columns —
// validateMapping still rejects anything left unmapped.
export async function loadRunRequest(
  userId: string,
  datasetId: string,
  body: Record<string, unknown>
): Promise<Result> {
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } })
  if (!dataset || dataset.userId !== userId) {
    return { value: null, error: "Not found", status: 404 }
  }

  const { promptVersionId } = body
  if (typeof promptVersionId !== "string" || !promptVersionId) {
    return { value: null, error: "promptVersionId is required", status: 400 }
  }
  const version = await prisma.promptVersion.findUnique({
    where: { id: promptVersionId },
    include: { prompt: { select: { userId: true } } },
  })
  if (!version || version.prompt.userId !== userId) {
    return { value: null, error: "invalid promptVersionId", status: 400 }
  }

  const { params, error } = validateRunParams(body)
  if (params === null) return { value: null, error, status: 400 }
  if (params.maxTokens > DATASET_RUN_MAX_TOKENS) {
    return {
      value: null,
      error: `maxTokens must be at most ${DATASET_RUN_MAX_TOKENS} for dataset runs`,
      status: 400,
    }
  }

  const templateVars = extractTemplateVariables(version.systemPrompt, version.userPrompt)
  let variableMapping: Record<string, string>
  if (body.variableMapping === undefined || body.variableMapping === null) {
    variableMapping = Object.fromEntries(
      templateVars.filter((v) => dataset.columns.includes(v)).map((v) => [v, v])
    )
  } else {
    const parsed = validateVariables(body.variableMapping)
    if (parsed === null) {
      return { value: null, error: "variableMapping must be an object of string → string", status: 400 }
    }
    variableMapping = parsed
  }
  const mappingError = validateMapping(templateVars, variableMapping, dataset.columns)
  if (mappingError) return { value: null, error: mappingError, status: 400 }

  return {
    value: {
      dataset: { id: dataset.id, columns: dataset.columns, rowCount: dataset.rowCount },
      version: { id: version.id, systemPrompt: version.systemPrompt, userPrompt: version.userPrompt },
      params,
      variableMapping,
    },
    error: null,
    status: 0,
  }
}
