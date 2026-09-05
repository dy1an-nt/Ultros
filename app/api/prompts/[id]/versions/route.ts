import { prisma } from "@/lib/prisma"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  const prompt = await db.prompt.require(params.id)

  const versions = await prisma.promptVersion.findMany({
    where: { promptId: prompt.id },
    orderBy: { versionNumber: "desc" },
  })

  return jsonOk(versions)
})

export const POST = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ req, params, db }) => {
    const prompt = await db.prompt.require(params.id)
    const body = await readJson(req)
    const { systemPrompt, userPrompt, variables, label } = body as {
      systemPrompt?: string
      userPrompt?: string
      variables?: Record<string, string>
      label?: string | null
    }

    if (!userPrompt?.trim()) {
      throw new ApiError("VALIDATION_ERROR", "userPrompt is required")
    }

    const latest = await prisma.promptVersion.findFirst({
      where: { promptId: prompt.id },
      orderBy: { versionNumber: "desc" },
    })
    const nextVersion = (latest?.versionNumber ?? 0) + 1

    const version = await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        versionNumber: nextVersion,
        systemPrompt: systemPrompt ?? "",
        userPrompt,
        variables: variables ?? {},
        label: label ?? null,
      },
    })

    return jsonOk(version, 201)
  }
)
