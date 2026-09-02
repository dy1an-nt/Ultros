import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { runStream, interpolateVariables } from "@/lib/ai"
import { getModelInfo } from "@/lib/ai/models"
import { validateRunParams, validateVariables, type ValidatedRunParams } from "@/lib/ai/validate"
import { calculateCost } from "@/lib/ai/pricing"
import { errorResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

type CompareSlot = { slot: 0 | 1 | 2; model: string }

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("run", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }
  const { promptVersionId, slots, temperature, maxTokens, topP, variables } = body

  if (!promptVersionId || typeof promptVersionId !== "string") {
    return errorResponse("VALIDATION_ERROR", "promptVersionId is required")
  }
  if (!Array.isArray(slots) || slots.length === 0 || slots.length > 3) {
    return errorResponse("VALIDATION_ERROR", "slots must be an array of 1-3 items")
  }

  const seenSlots = new Set<number>()
  let runParams: ValidatedRunParams | null = null
  for (const s of slots as CompareSlot[]) {
    if (!Number.isInteger(s?.slot) || s.slot < 0 || s.slot > 2 || seenSlots.has(s.slot)) {
      return errorResponse("VALIDATION_ERROR", "slot indices must be unique values 0-2")
    }
    seenSlots.add(s.slot)
    const { params, error } = validateRunParams({ model: s.model, temperature, maxTokens, topP })
    if (!params) {
      return errorResponse("VALIDATION_ERROR", error)
    }
    runParams = params
  }
  const shared = runParams as ValidatedRunParams

  const vars = validateVariables(variables)
  if (vars === null) {
    return errorResponse("VALIDATION_ERROR", "variables must be an object of string values")
  }

  const version = await prisma.promptVersion.findUnique({
    where: { id: promptVersionId },
    include: { prompt: true },
  })

  if (!version) return errorResponse("NOT_FOUND")
  if (version.prompt.userId !== user.id) {
    return errorResponse("FORBIDDEN")
  }

  const resolvedSystem = interpolateVariables(version.systemPrompt, vars)
  const resolvedUser = interpolateVariables(version.userPrompt, vars)
  const enc = new TextEncoder()

  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      // enqueue throws once the client disconnects; never let that abort the
      // other slots or skip persistence.
      const safeEnqueue = (event: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(enc.encode(JSON.stringify(event) + "\n"))
        } catch {
          closed = true
        }
      }

      await Promise.all(
        (slots as CompareSlot[]).map(async ({ slot, model }) => {
          const startTime = Date.now()

          let fullText = ""
          let inputTokens = 0
          let outputTokens = 0
          let finishReason = "unknown"
          try {
            const result = runStream({
              model,
              systemPrompt: resolvedSystem,
              userPrompt: resolvedUser,
              temperature: shared.temperature,
              maxOutputTokens: shared.maxTokens,
              topP: shared.topP,
              abortSignal: req.signal,
            })

            for await (const chunk of result.textStream) {
              fullText += chunk
              safeEnqueue({ type: "chunk", slot, text: chunk })
            }

            const usage = await result.usage
            inputTokens = usage.inputTokens ?? 0
            outputTokens = usage.outputTokens ?? 0
            finishReason = await result.finishReason
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Stream error"
            safeEnqueue({ type: "error", slot, error: msg })
            return
          }

          const costUsd = calculateCost(model, inputTokens, outputTokens)
          const latencyMs = Date.now() - startTime
          const modelInfo = getModelInfo(model)

          // Persistence failures must not be reported as generation errors —
          // the model output above already succeeded.
          let runId: string | null = null
          try {
            const run = await prisma.promptRun.create({
              data: {
                promptVersionId: version.id,
                promptId: version.promptId,
                userId: user.id,
                model,
                provider: modelInfo?.provider ?? "unknown",
                temperature: shared.temperature,
                maxTokens: shared.maxTokens,
                inputTokens,
                outputTokens,
                latencyMs,
                costUsd,
                responseText: fullText,
                finishReason,
              },
            })
            runId = run.id

            // UsageSummary is a display convenience; PromptRun rows are authoritative.
            const today = new Date()
            today.setUTCHours(0, 0, 0, 0)
            await prisma.usageSummary.upsert({
              where: { userId_date: { userId: user.id, date: today } },
              create: { userId: user.id, date: today, totalRuns: 1, totalInputTokens: inputTokens, totalOutputTokens: outputTokens, totalCostUsd: costUsd },
              update: { totalRuns: { increment: 1 }, totalInputTokens: { increment: inputTokens }, totalOutputTokens: { increment: outputTokens }, totalCostUsd: { increment: costUsd } },
            })
          } catch (err) {
            logger.exception("Failed to persist compare run", err, { slot, model })
          }

          safeEnqueue({ type: "done", slot, runId, inputTokens, outputTokens, costUsd, latencyMs })
        })
      )

      if (!closed) {
        try {
          controller.close()
        } catch {
          // already closed by the runtime
        }
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  })
}
