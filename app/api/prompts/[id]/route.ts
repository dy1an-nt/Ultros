import { prisma } from "@/lib/prisma"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  return jsonOk(await db.prompt.requireDetail(params.id))
})

export const PATCH = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ req, params, db }) => {
    const existing = await db.prompt.require(params.id)
    const body = await readJson(req)
    const { title, description, tags } = body

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      throw new ApiError("VALIDATION_ERROR", "title must be a non-empty string")
    }
    if (description !== undefined && description !== null && typeof description !== "string") {
      throw new ApiError("VALIDATION_ERROR", "description must be a string")
    }
    if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))) {
      throw new ApiError("VALIDATION_ERROR", "tags must be an array of strings")
    }

    const updated = await prisma.prompt.update({
      where: { id: existing.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description }),
        ...(tags !== undefined && { tags }),
      },
    })

    return jsonOk(updated)
  }
)

export const DELETE = withUser<{ id: string }>(
  { rateLimit: "mutation" },
  async ({ params, db }) => {
    const existing = await db.prompt.require(params.id)

    // Soft delete: runs/evals keep their history for usage accounting; the
    // prompt just disappears from every list and lookup (deletedAt filters).
    await prisma.prompt.update({ where: { id: existing.id }, data: { deletedAt: new Date() } })

    return jsonOk({ id: existing.id })
  }
)
