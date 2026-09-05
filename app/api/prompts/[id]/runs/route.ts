import { prisma } from "@/lib/prisma"
import { withUser } from "@/lib/api/handler"
import { jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  const prompt = await db.prompt.require(params.id)

  const runs = await prisma.promptRun.findMany({
    where: { promptId: prompt.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      promptVersion: { select: { versionNumber: true, label: true } },
    },
  })

  return jsonOk(runs)
})
