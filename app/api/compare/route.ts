import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { runStream, interpolateVariables } from "@/lib/ai"
import { getModelInfo } from "@/lib/ai/models"
import { calculateCost } from "@/lib/ai/pricing"

type CompareSlot = { slot: 0 | 1 | 2; model: string }

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const body = await req.json()
  const { promptVersionId, slots, temperature, maxTokens, topP, variables } = body

  if (!promptVersionId || !Array.isArray(slots) || slots.length === 0 || slots.length > 3) {
    return Response.json({ data: null, error: "slots must be an array of 1-3 items" }, { status: 400 })
  }

  for (const s of slots as CompareSlot[]) {
    if (!getModelInfo(s.model)) {
      return Response.json({ data: null, error: `Unknown model: ${s.model}` }, { status: 400 })
    }
  }

  const version = await prisma.promptVersion.findUnique({
    where: { id: promptVersionId },
    include: { prompt: true },
  })

  if (!version) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (version.prompt.userId !== user.id) {
    return Response.json({ data: null, error: "Forbidden" }, { status: 403 })
  }

  const vars = (variables ?? {}) as Record<string, string>
  const resolvedSystem = interpolateVariables(version.systemPrompt, vars)
  const resolvedUser = interpolateVariables(version.userPrompt, vars)
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      await Promise.all(
        (slots as CompareSlot[]).map(async ({ slot, model }) => {
          const startTime = Date.now()
          try {
            const result = runStream({
              model,
              systemPrompt: resolvedSystem,
              userPrompt: resolvedUser,
              temperature: temperature ?? 1.0,
              maxOutputTokens: maxTokens ?? 1024,
              topP: topP ?? undefined,
            })

            let fullText = ""
            for await (const chunk of result.textStream) {
              fullText += chunk
              controller.enqueue(
                enc.encode(JSON.stringify({ type: "chunk", slot, text: chunk }) + "\n")
              )
            }

            const usage = await result.usage
            const inputTokens = usage.inputTokens ?? 0
            const outputTokens = usage.outputTokens ?? 0
            const costUsd = calculateCost(model, inputTokens, outputTokens)
            const latencyMs = Date.now() - startTime
            const modelInfo = getModelInfo(model)

            const today = new Date()
            today.setUTCHours(0, 0, 0, 0)

            const run = await prisma.promptRun.create({
              data: {
                promptVersionId: version.id,
                promptId: version.promptId,
                userId: user.id,
                model,
                provider: modelInfo?.provider ?? "unknown",
                temperature: temperature ?? 1.0,
                maxTokens: maxTokens ?? 1024,
                inputTokens,
                outputTokens,
                latencyMs,
                costUsd,
                responseText: fullText,
                finishReason: "stop",
              },
            })

            // UsageSummary is a display convenience; PromptRun rows are authoritative.
            await prisma.usageSummary.upsert({
              where: { userId_date: { userId: user.id, date: today } },
              create: { userId: user.id, date: today, totalRuns: 1, totalInputTokens: inputTokens, totalOutputTokens: outputTokens, totalCostUsd: costUsd },
              update: { totalRuns: { increment: 1 }, totalInputTokens: { increment: inputTokens }, totalOutputTokens: { increment: outputTokens }, totalCostUsd: { increment: costUsd } },
            })

            controller.enqueue(
              enc.encode(
                JSON.stringify({ type: "done", slot, runId: run.id, inputTokens, outputTokens, costUsd, latencyMs }) + "\n"
              )
            )
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Stream error"
            controller.enqueue(enc.encode(JSON.stringify({ type: "error", slot, error: msg }) + "\n"))
          }
        })
      )
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  })
}
