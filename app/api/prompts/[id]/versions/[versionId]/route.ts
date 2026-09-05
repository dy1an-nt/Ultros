import { prisma } from "@/lib/prisma"
import { withUser } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string; versionId: string }>(async ({ params, db }) => {
  // Ownership rides on the prompt, so check it first: a version id that does
  // not belong to this prompt is a 404 whoever owns it.
  await db.prompt.require(params.id)

  const version = await prisma.promptVersion.findUnique({
    where: { id: params.versionId },
    include: { prompt: { select: { userId: true } } },
  })
  if (!version || version.promptId !== params.id) throw new ApiError("NOT_FOUND")

  return jsonOk(version)
})
