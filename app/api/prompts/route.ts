import type { PrismaClient } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser(async ({ db }) => {
  return jsonOk(await db.prompt.list())
})

export const POST = withUser({ rateLimit: "mutation" }, async ({ req, user }) => {
  const body = await readJson(req)
  const { title, description, tags, systemPrompt, userPrompt } = body as {
    title?: string
    description?: string | null
    tags?: string[]
    systemPrompt?: string
    userPrompt?: string
  }

  if (!title?.trim()) throw new ApiError("VALIDATION_ERROR", "title is required")
  if (!userPrompt?.trim()) throw new ApiError("VALIDATION_ERROR", "userPrompt is required")

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

  return jsonOk(prompt, 201)
})
