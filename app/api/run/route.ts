import { auth } from "@clerk/nextjs/server"
import { NextRequest, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { runStream, interpolateVariables } from "@/lib/ai"
import { getModelInfo } from "@/lib/ai/models"
import { validateRunParams, validateVariables } from "@/lib/ai/validate"
import { calculateCost } from "@/lib/ai/pricing"
import { errorResponse } from "@/lib/api/errors"

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
  const { promptVersionId, model, temperature, maxTokens, topP, variables } = body

  if (!promptVersionId || typeof promptVersionId !== "string") {
    return errorResponse("VALIDATION_ERROR", "promptVersionId and model are required")
  }

  const { params, error: paramError } = validateRunParams({ model, temperature, maxTokens, topP })
  if (!params) {
    return errorResponse("VALIDATION_ERROR", paramError)
  }

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

  const startTime = Date.now()

  const persistRun = async (input: {
    inputTokens: number
    outputTokens: number
    responseText: string
    finishReason: string
  }) => {
    const costUsd = calculateCost(params.model, input.inputTokens, input.outputTokens)
    const modelInfo = getModelInfo(params.model)
    await prisma.promptRun.create({
      data: {
        promptVersionId: version.id,
        promptId: version.promptId,
        userId: user.id,
        model: params.model,
        provider: modelInfo?.provider ?? "unknown",
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        latencyMs: Date.now() - startTime,
        costUsd,
        responseText: input.responseText,
        finishReason: input.finishReason,
      },
    })
    // UsageSummary is a display convenience; PromptRun rows are authoritative.
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    await prisma.usageSummary.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      create: { userId: user.id, date: today, totalRuns: 1, totalInputTokens: input.inputTokens, totalOutputTokens: input.outputTokens, totalCostUsd: costUsd },
      update: { totalRuns: { increment: 1 }, totalInputTokens: { increment: input.inputTokens }, totalOutputTokens: { increment: input.outputTokens }, totalCostUsd: { increment: costUsd } },
    })
  }

  // Aborted streams emit no finish event and no usage — accumulate the text
  // ourselves and estimate tokens at ~4 chars each (same heuristic as the
  // dataset cost estimate) so partial spend still lands in the books.
  let streamedText = ""

  const result = runStream({
    model: params.model,
    systemPrompt: resolvedSystem,
    userPrompt: resolvedUser,
    temperature: params.temperature,
    maxOutputTokens: params.maxTokens,
    topP: params.topP,
    abortSignal: req.signal,
    onTextDelta: (delta) => {
      streamedText += delta
    },
    onAbort: async () => {
      await persistRun({
        inputTokens: Math.ceil((resolvedSystem.length + resolvedUser.length) / 4),
        outputTokens: Math.ceil(streamedText.length / 4),
        responseText: streamedText,
        finishReason: "aborted",
      })
    },
  })

  // after() keeps the serverless invocation alive past the streamed response;
  // a dangling promise here would be frozen with the function and the run lost.
  after(async () => {
    try {
      const [usage, text, finishReason] = await Promise.all([
        result.usage,
        result.text,
        result.finishReason,
      ])
      await persistRun({
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        responseText: text,
        finishReason,
      })
    } catch (err) {
      // Client abort rejects the result promises; the onAbort path has
      // already persisted the partial run with estimated tokens.
      if (!(err instanceof Error && err.name === "AbortError")) {
        console.error("Failed to persist prompt run:", err)
      }
    }
  })

  return result.toTextStreamResponse()
}
