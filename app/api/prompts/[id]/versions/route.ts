import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (prompt.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const versions = await prisma.promptVersion.findMany({
    where: { promptId: id },
    orderBy: { versionNumber: "desc" },
  })

  return Response.json({ data: versions, error: null })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const prompt = await prisma.prompt.findUnique({ where: { id } })
  if (!prompt) return Response.json({ data: null, error: "Not found" }, { status: 404 })
  if (prompt.userId !== user.id) return Response.json({ data: null, error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { systemPrompt, userPrompt, variables, label } = body

  if (!userPrompt?.trim()) {
    return Response.json({ data: null, error: "userPrompt is required" }, { status: 400 })
  }

  const latest = await prisma.promptVersion.findFirst({
    where: { promptId: id },
    orderBy: { versionNumber: "desc" },
  })
  const nextVersion = (latest?.versionNumber ?? 0) + 1

  const version = await prisma.promptVersion.create({
    data: {
      promptId: id,
      versionNumber: nextVersion,
      systemPrompt: systemPrompt ?? "",
      userPrompt,
      variables: variables ?? {},
      label: label ?? null,
    },
  })

  return Response.json({ data: version, error: null }, { status: 201 })
}
