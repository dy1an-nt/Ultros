import { prisma } from "@/lib/prisma"
import { launchDatasetRun } from "@/lib/datasets/runner"

export const MAX_VARIANTS = 4
export const MAX_MODELS = 3

export type ExperimentLaunchParams = {
  userId: string
  name: string
  datasetId: string
  rubricId: string
  variantVersionIds: string[]
  models: string[]
  temperature: number
  maxTokens: number
  totalRows: number
  // per-variant mapping — variants of one prompt can declare different {{vars}}
  variableMappings: Record<string, Record<string, string>>
}

export type ExperimentCell = {
  promptVersionId: string
  model: string
  datasetRunId: string
  status: string
}

// An experiment cell IS a DatasetRun (architect pin #1): each variant × model
// goes through the Sprint 4 fan-out with experimentId set. Cells share the
// per-user QStash flow-control key, so a 12-cell experiment queues politely
// instead of stampeding providers.
export async function launchExperiment(params: ExperimentLaunchParams) {
  const experiment = await prisma.experiment.create({
    data: {
      userId: params.userId,
      name: params.name,
      datasetId: params.datasetId,
      rubricId: params.rubricId,
      variantVersionIds: params.variantVersionIds,
      models: params.models,
      status: "pending",
    },
  })

  const cells: ExperimentCell[] = []
  for (const promptVersionId of params.variantVersionIds) {
    for (const model of params.models) {
      const run = await launchDatasetRun({
        userId: params.userId,
        datasetId: params.datasetId,
        promptVersionId,
        rubricId: params.rubricId,
        model,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        variableMapping: params.variableMappings[promptVersionId],
        totalRows: params.totalRows,
        experimentId: experiment.id,
      })
      cells.push({ promptVersionId, model, datasetRunId: run.id, status: run.status })
    }
  }

  // Guarded bump: a fast cell may already have finalized the experiment to
  // "complete" — never write "running" over a terminal state.
  await prisma.experiment.updateMany({
    where: { id: experiment.id, status: "pending" },
    data: { status: "running" },
  })
  const updated = await prisma.experiment.findUniqueOrThrow({ where: { id: experiment.id } })
  return { experiment: updated, cells }
}
