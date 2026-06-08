import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import type { PrismaClient } from "@/app/generated/prisma/client"

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const prompts = await prisma.prompt.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { versions: true, runs: true } } },
  })

  return Response.json({ data: prompts, error: null })
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await getDbUser(clerkId)
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const body = await req.json()
  const { title, description, tags, systemPrompt, userPrompt } = body

  if (!title?.trim()) return Response.json({ data: null, error: "title is required" }, { status: 400 })
  if (!userPrompt?.trim()) return Response.json({ data: null, error: "userPrompt is required" }, { status: 400 })

  const prompt = await prisma.$transaction(async (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => {
    const p = await tx.prompt.create({
      data: {
        userId: user.id,
        title: title.trim(),
        description: description ?? null,
        tags: tags ?? [],
      },
    })
    await tx.promptVersion.create({
      data: {
        promptId: p.id,
        versionNumber: 1,
        systemPrompt: systemPrompt ?? "",
        userPrompt,
      },
    })
    return tx.prompt.findUnique({
      where: { id: p.id },
      include: { versions: { select: { id: true, versionNumber: true } } },
    })
  })

  return Response.json({ data: prompt, error: null }, { status: 201 })
}
