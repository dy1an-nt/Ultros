import { loadRunRequest } from "@/lib/datasets/runRequest"
import { launchDatasetRun } from "@/lib/datasets/runner"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const POST = withUser<{ id: string }>(
  { rateLimit: "launch" },
  async ({ req, params, user, db }) => {
    const body = await readJson(req)

    // The cost gate: launches must be deliberate, never a default.
    if (body.confirm !== true) {
      throw new ApiError("VALIDATION_ERROR", "confirm: true is required. Review the cost estimate first")
    }

    const loaded = await loadRunRequest(user.id, params.id, body)
    if (loaded.value === null) {
      throw new ApiError(loaded.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", loaded.error)
    }
    const { dataset, version, params: runParams, variableMapping } = loaded.value

    let rubricId: string | null = null
    if (body.rubricId !== undefined && body.rubricId !== null) {
      if (typeof body.rubricId !== "string") {
        throw new ApiError("VALIDATION_ERROR", "invalid rubricId")
      }
      // 400 not 404/403. Does not leak whether another user's rubric id exists.
      rubricId = (await db.rubric.requireRef(body.rubricId, "rubricId")).id
    }

    const run = await launchDatasetRun({
      userId: user.id,
      datasetId: dataset.id,
      promptVersionId: version.id,
      rubricId,
      model: runParams.model,
      temperature: runParams.temperature,
      maxTokens: runParams.maxTokens,
      variableMapping,
      totalRows: dataset.rowCount,
    })

    return jsonOk(run, 202)
  }
)
