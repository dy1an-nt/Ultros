import { auth } from "@clerk/nextjs/server"
import { NextRequest, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { runStream, interpolateVariables } from "@/lib/ai"
import { getModelInfo } from "@/lib/ai/models"
import { validateRunParams, validateVariables } from "@/lib/ai/validate"
import { calculateCost } from "@/lib/ai/pricing"

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }
  const { promptVersionId, model, temperature, maxTokens, topP, variables } = body

  if (!promptVersionId || typeof promptVersionId !== "string") {
    return Response.json(
      { data: null, error: "promptVersionId and model are required" },
      { status: 400 }
    )
  }

  const { params, error: paramError } = validateRunParams({ model, temperature, maxTokens, topP })
  if (!params) {
    return Response.json({ data: null, error: paramError }, { status: 400 })
  }

  const vars = validateVariables(variables)
  if (vars === null) {
    return Response.json(
      { data: null, error: "variables must be an object of string values" },
      { status: 400 }
    )
  }

  const version = await prisma.promptVersion.findUnique({
    where: { id: promptVersionId },
    include: { prompt: true },
  })

  if (!version) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (version.prompt.userId !== user.id) {
    return Response.json({ data: null, error: "Forbidden" }, { status: 403 })
  }

  const resolvedSystem = interpolateVariables(version.systemPrompt, vars)
  const resolvedUser = interpolateVariables(version.userPrompt, vars)

  const startTime = Date.now()

  const result = runStream({
    model: params.model,
    systemPrompt: resolvedSystem,
    userPrompt: resolvedUser,
    temperature: params.temperature,
    maxOutputTokens: params.maxTokens,
    topP: params.topP,
    abortSignal: req.signal,
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
      const latencyMs = Date.now() - startTime
      const inputTokens = usage.inputTokens ?? 0
      const outputTokens = usage.outputTokens ?? 0
      const costUsd = calculateCost(params.model, inputTokens, outputTokens)
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
          inputTokens,
          outputTokens,
          latencyMs,
          costUsd,
          responseText: text,
          finishReason,
        },
      })

      // UsageSummary is a display convenience; PromptRun rows are authoritative.
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      await prisma.usageSummary.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        create: { userId: user.id, date: today, totalRuns: 1, totalInputTokens: inputTokens, totalOutputTokens: outputTokens, totalCostUsd: costUsd },
        update: { totalRuns: { increment: 1 }, totalInputTokens: { increment: inputTokens }, totalOutputTokens: { increment: outputTokens }, totalCostUsd: { increment: costUsd } },
      })
    } catch (err) {
      // Client abort rejects the result promises; nothing to persist then.
      if (!(err instanceof Error && err.name === "AbortError")) {
        console.error("Failed to persist prompt run:", err)
      }
    }
  })

  return result.toTextStreamResponse()
}
