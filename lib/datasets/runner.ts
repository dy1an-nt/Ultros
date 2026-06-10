import { after } from "next/server"
import { Client } from "@upstash/qstash"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/app/generated/prisma/client"
import { runDatasetRowJob } from "./rowJob"

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
}

// QStash fan-out in production (one message per row, deduped, flow-controlled
// per user so one batch can't starve the platform); sequential after() loop in
// dev — QStash cannot reach localhost. The row job is identical in both paths.
export async function launchDatasetRun(params: LaunchParams) {
  const run = await prisma.datasetRun.create({
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
    },
  })

  const token = process.env.UPSTASH_QSTASH_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (process.env.NODE_ENV === "production" && token && appUrl) {
    const client = new Client({ token })
    const url = `${appUrl.replace(/\/$/, "")}/api/jobs/dataset-row`
    await Promise.all(
      Array.from({ length: params.totalRows }, (_, rowIndex) =>
        client.publishJSON({
          url,
          body: { datasetRunId: run.id, rowIndex },
          deduplicationId: `${run.id}:${rowIndex}`,
          flowControl: { key: params.userId, parallelism: 5 },
        })
      )
    )
  } else {
    after(async () => {
      for (let rowIndex = 0; rowIndex < params.totalRows; rowIndex++) {
        try {
          await runDatasetRowJob(run.id, rowIndex)
        } catch (err) {
          console.error(`Dataset row job ${run.id}:${rowIndex} failed:`, err)
        }
      }
    })
  }

  return run
}
