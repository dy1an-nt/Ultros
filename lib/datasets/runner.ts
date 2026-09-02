import { after } from "next/server"
import { Client } from "@upstash/qstash"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/app/generated/prisma/client"
import { runDatasetRowJob } from "./rowJob"
import { logger } from "@/lib/logger"

export type LaunchParams = {
  userId: string
  datasetId: string
  promptVersionId: string
  rubricId: string | null
  model: string
  temperature: number
  maxTokens: number
  variableMapping: Record<string, string>
  totalRows: number
  experimentId?: string | null // set when this run is one experiment cell
}

export async function createDatasetRun(params: LaunchParams) {
  return prisma.datasetRun.create({
    data: {
      userId: params.userId,
      datasetId: params.datasetId,
      promptVersionId: params.promptVersionId,
      rubricId: params.rubricId,
      model: params.model,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      variableMapping: params.variableMapping as Prisma.InputJsonValue,
      status: "pending",
      totalRows: params.totalRows,
      experimentId: params.experimentId ?? null,
    },
  })
}

// QStash fan-out in production (one message per row, deduped, flow-controlled
// per user so one batch can't starve the platform); sequential after() loop in
// dev, QStash cannot reach localhost. The row job is identical in both paths.
// Exported separately from creation so callers that persist linked state (a
// pending RegressionRun) can do so before the first job can possibly finish.
export async function fanOutDatasetRun(run: { id: string; userId: string }, totalRows: number) {
  const token = process.env.UPSTASH_QSTASH_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (process.env.NODE_ENV === "production" && token && appUrl) {
    const base = appUrl.replace(/\/$/, "")
    const client = new Client({ token })
    const url = `${base}/api/jobs/dataset-row`
    await Promise.all(
      Array.from({ length: totalRows }, (_, rowIndex) =>
        client.publishJSON({
          url,
          body: { datasetRunId: run.id, rowIndex },
          deduplicationId: `${run.id}:${rowIndex}`,
          flowControl: { key: run.userId, parallelism: 5 },
          // A row whose deliveries all fail would wedge the batch one row
          // short of finalizing, the callback records it as a failed row.
          failureCallback: `${base}/api/jobs/failed`,
        })
      )
    )
  } else {
    after(async () => {
      for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
        try {
          await runDatasetRowJob(run.id, rowIndex)
        } catch (err) {
          logger.exception("Dataset row job failed", err, {
            datasetRunId: run.id,
            rowIndex,
          })
        }
      }
    })
  }
}

export async function launchDatasetRun(params: LaunchParams) {
  const run = await createDatasetRun(params)
  await fanOutDatasetRun(run, params.totalRows)
  return run
}
