import { after } from "next/server"
import { Client } from "@upstash/qstash"
import { runEvalJob } from "./runEvalJob"

// QStash in production, in-process after() fallback otherwise — QStash cannot
// reach localhost, and after() keeps the serverless invocation alive past the
// response, so the dev path needs no HTTP hop or tunnel.
export async function enqueueEvalJob(evaluationId: string): Promise<void> {
  const token = process.env.UPSTASH_QSTASH_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (process.env.NODE_ENV === "production" && token && appUrl) {
    const client = new Client({ token })
    await client.publishJSON({
      url: `${appUrl.replace(/\/$/, "")}/api/jobs/eval`,
      body: { evaluationId },
    })
    return
  }

  after(() => runEvalJob(evaluationId))
}
