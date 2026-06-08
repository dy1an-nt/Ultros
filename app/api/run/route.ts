import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { runStream, interpolateVariables } from "@/lib/ai"
import { calculateCost } from "@/lib/ai/pricing"

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const body = await req.json()
  const { promptVersionId, model, temperature, maxTokens, topP, variables } = body

  if (!promptVersionId || !model) {
    return Response.json(
      { data: null, error: "promptVersionId and model are required" },
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

  const vars = (variables ?? {}) as Record<string, string>
  const resolvedSystem = interpolateVariables(version.systemPrompt, vars)
  const resolvedUser = interpolateVariables(version.userPrompt, vars)

  const startTime = Date.now()

  const result = runStream({
    model,
    systemPrompt: resolvedSystem,
    userPrompt: resolvedUser,
    temperature: temperature ?? 1.0,
    maxOutputTokens: maxTokens ?? 1024,
    topP: topP ?? undefined,
  })

  // Save run after streaming completes — do not block the stream response
  Promise.resolve(result.usage).then(async (usage) => {
    const text = await result.text
    const latencyMs = Date.now() - startTime
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const costUsd = calculateCost(model, inputTokens, outputTokens)
    await prisma.promptRun.create({
      data: {
        promptVersionId: version.id,
        promptId: version.promptId,
        userId: user.id,
        model,
        provider: "anthropic",
        temperature: temperature ?? 1.0,
        maxTokens: maxTokens ?? 1024,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd,
        responseText: text,
        finishReason: "stop",
      },
    })
  }).catch(() => {
    // Swallow — stream already sent to client
  })

  return result.toTextStreamResponse()
}
