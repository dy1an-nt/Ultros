import { prisma } from "@/lib/prisma"
import { withUser } from "@/lib/api/handler"
import { jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  const dataset = await db.dataset.require(params.id)

  const runs = await prisma.datasetRun.findMany({
    where: { datasetId: dataset.id },
    orderBy: { createdAt: "desc" },
  })
  return jsonOk(runs)
})
