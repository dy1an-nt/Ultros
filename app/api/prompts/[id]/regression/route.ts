import { prisma } from "@/lib/prisma"
import { createDatasetRun, fanOutDatasetRun } from "@/lib/datasets/runner"
import { extractTemplateVariables, validateMapping } from "@/lib/datasets/estimate"
import { validateThreshold } from "@/lib/regression/compare"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

// Launch a regression run: the new version × the baseline's dataset, rubric
// and model (pinned, regression compares prompts, not models), the verdict
// is written by the finalize hook when the run completes; poll the DatasetRun
// for progress, read the RegressionRun via the history endpoint.
export const POST = withUser<{ id: string }>(
  { rateLimit: "launch" },
  async ({ req, params, user, db }) => {
    const prompt = await db.prompt.requireHidden(params.id)

    const baseline = await prisma.baseline.findUnique({ where: { promptId: prompt.id } })
    if (!baseline) {
      throw new ApiError("NOT_FOUND", "no baseline set for this prompt. Set a baseline first")
    }

    const body = await readJson(req)

    const { newVersionId } = body
    if (typeof newVersionId !== "string" || !newVersionId) {
      throw new ApiError("VALIDATION_ERROR", "newVersionId is required")
    }
    const version = await prisma.promptVersion.findUnique({ where: { id: newVersionId } })
    if (!version || version.promptId !== prompt.id) {
      throw new ApiError("VALIDATION_ERROR", "invalid newVersionId")
    }

    const { threshold, error: thresholdError } = validateThreshold(body.threshold)
    if (threshold === null) {
      throw new ApiError("VALIDATION_ERROR", thresholdError)
    }

    // The new run must be scorable, or there is nothing to compare.
    const rubric = await db.rubric.requireRef(
      baseline.rubricId,
      "rubricId",
      "the baseline's rubric no longer exists. Set a new baseline"
    )

    const baselineRun = await prisma.datasetRun.findUnique({ where: { id: baseline.datasetRunId } })
    const dataset = await prisma.dataset.findUnique({ where: { id: baseline.datasetId } })
    if (!baselineRun || !dataset) {
      // Restrict on DatasetRun→Dataset makes this unreachable in practice.
      throw new ApiError("VALIDATION_ERROR", "the baseline's run or dataset no longer exists. Set a new baseline")
    }

    // Start from the baseline run's mapping for vars the new version kept,
    // identity-fill any new vars that match a column.
    const templateVars = extractTemplateVariables(version.systemPrompt, version.userPrompt)
    const baselineMapping = baselineRun.variableMapping as Record<string, string>
    const variableMapping = Object.fromEntries(
      templateVars
        .map((v) => [v, baselineMapping[v] ?? v] as const)
        .filter(([, column]) => dataset.columns.includes(column))
    )
    const mappingError = validateMapping(templateVars, variableMapping, dataset.columns)
    if (mappingError) throw new ApiError("VALIDATION_ERROR", mappingError)

    const run = await createDatasetRun({
      userId: user.id,
      datasetId: dataset.id,
      promptVersionId: version.id,
      rubricId: rubric.id,
      model: baselineRun.model,
      temperature: baselineRun.temperature,
      maxTokens: baselineRun.maxTokens,
      variableMapping,
      totalRows: dataset.rowCount,
    })
    // Persist the regression intent before any row job can finish, the
    // finalize hook looks this row up by datasetRunId.
    const regressionRun = await prisma.regressionRun.create({
      data: {
        baselineId: baseline.id,
        userId: user.id,
        newVersionId: version.id,
        datasetRunId: run.id,
        status: "pending",
        threshold,
        regressedRowIds: [],
      },
    })
    await fanOutDatasetRun(run, dataset.rowCount)

    return jsonOk(
      {
        datasetRunId: run.id,
        regressionRunId: regressionRun.id,
        baselineScore: baseline.baselineScore,
      },
      202
    )
  }
)
