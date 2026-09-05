import { withUser } from "@/lib/api/handler"
import { jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  return jsonOk(await db.evaluation.require(params.id))
})
