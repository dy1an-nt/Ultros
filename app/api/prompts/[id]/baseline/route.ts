import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { toBaselineDto } from "@/lib/regression/baseline"

async function loadPrompt(clerkId: string, promptId: string) {
  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return { user: null, prompt: null }
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!prompt || prompt.userId !== user.id) return { user, prompt: null }
  return { user, prompt }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const { user, prompt } = await loadPrompt(clerkId, id)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })
  if (!prompt) return Response.json({ data: null, error: "Not found" }, { status: 404 })

  const baseline = await prisma.baseline.findUnique({ where: { promptId: id } })
  if (!baseline) {
    return Response.json({ data: null, error: "no baseline set for this prompt" }, { status: 404 })
  }
  return Response.json({ data: await toBaselineDto(baseline), error: null })
}

// A baseline is set by pointing at an existing complete DatasetRun of the
// version (architect pin: cheaper than launching a fresh run, and the user
// blesses numbers they have already seen).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const { user, prompt } = await loadPrompt(clerkId, id)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })
  if (!prompt) return Response.json({ data: null, error: "Not found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const { promptVersionId, datasetRunId } = body
  if (typeof promptVersionId !== "string" || !promptVersionId) {
    return Response.json({ data: null, error: "promptVersionId is required" }, { status: 400 })
  }
  if (typeof datasetRunId !== "string" || !datasetRunId) {
    return Response.json({ data: null, error: "datasetRunId is required" }, { status: 400 })
  }

  const version = await prisma.promptVersion.findUnique({ where: { id: promptVersionId } })
  if (!version || version.promptId !== prompt.id) {
    return Response.json({ data: null, error: "invalid promptVersionId" }, { status: 400 })
  }

  const run = await prisma.datasetRun.findUnique({ where: { id: datasetRunId } })
  if (!run || run.userId !== user.id) {
    return Response.json({ data: null, error: "invalid datasetRunId" }, { status: 400 })
  }
  if (run.promptVersionId !== version.id) {
    return Response.json(
      { data: null, error: "datasetRunId does not belong to the given promptVersionId" },
      { status: 400 }
    )
  }
  if (run.status !== "complete") {
    return Response.json({ data: null, error: "baseline run must be complete" }, { status: 400 })
  }
  if (run.rubricId === null || run.avgScore === null || run.passRate === null) {
    return Response.json(
      { data: null, error: "baseline run must be scored against a rubric" },
      { status: 400 }
    )
  }

  const data = {
    userId: user.id,
    promptVersionId: version.id,
    datasetId: run.datasetId,
    rubricId: run.rubricId,
    datasetRunId: run.id,
    baselineScore: run.avgScore,
    baselinePassRate: run.passRate,
    setAt: new Date(),
  }
  // One active baseline per prompt — re-POST replaces it (and its regression
  // history goes stale against the new anchor, so the cascade is on delete only).
  const baseline = await prisma.baseline.upsert({
    where: { promptId: prompt.id },
    create: { promptId: prompt.id, ...data },
    update: data,
  })

  return Response.json({ data: await toBaselineDto(baseline), error: null }, { status: 201 })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const { user, prompt } = await loadPrompt(clerkId, id)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })
  if (!prompt) return Response.json({ data: null, error: "Not found" }, { status: 404 })

  const baseline = await prisma.baseline.findUnique({ where: { promptId: id } })
  if (!baseline) {
    return Response.json({ data: null, error: "no baseline set for this prompt" }, { status: 404 })
  }
  // Cascade removes the regression history — it is meaningless without its anchor.
  await prisma.baseline.delete({ where: { id: baseline.id } })
  return Response.json({ data: { id: baseline.id }, error: null })
}
