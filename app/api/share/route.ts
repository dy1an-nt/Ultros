import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { resourceBelongsToUser } from "@/lib/share/resolve"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

const RESOURCE_TYPES = ["promptRun", "datasetRun", "experiment"] as const

function shareUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return `${base.replace(/\/$/, "")}/share/${token}`
}

export const GET = withUser(async ({ db }) => {
  const shares = await db.share.listLive()
  return jsonOk(
    shares.map((s) => ({
      id: s.id,
      token: s.token,
      url: shareUrl(s.token),
      resourceType: s.resourceType,
      resourceId: s.resourceId,
      createdAt: s.createdAt.toISOString(),
    }))
  )
})

// Idempotent per (user, resource): re-POST returns the existing live link.
// A revoked share gets a NEW token. The old URL must stay dead forever.
export const POST = withUser({ rateLimit: "mutation" }, async ({ req, user }) => {
  const body = await readJson(req)

  const { resourceType, resourceId } = body
  if (typeof resourceType !== "string" || !(RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    throw new ApiError("VALIDATION_ERROR", `resourceType must be one of: ${RESOURCE_TYPES.join(", ")}`)
  }
  if (typeof resourceId !== "string" || !resourceId) {
    throw new ApiError("VALIDATION_ERROR", "resourceId is required")
  }

  if (!(await resourceBelongsToUser(resourceType, resourceId, user.id))) {
    throw new ApiError("NOT_FOUND")
  }

  const existing = await prisma.share.findUnique({
    where: {
      userId_resourceType_resourceId: { userId: user.id, resourceType, resourceId },
    },
  })

  if (existing && existing.revokedAt === null) {
    return jsonOk({ token: existing.token, url: shareUrl(existing.token), createdAt: existing.createdAt.toISOString() })
  }

  const token = nanoid(32)
  const share = existing
    ? await prisma.share.update({
        where: { id: existing.id },
        data: { token, revokedAt: null, createdAt: new Date() },
      })
    : await prisma.share.create({
        data: { userId: user.id, token, resourceType, resourceId },
      })

  return jsonOk({ token: share.token, url: shareUrl(share.token), createdAt: share.createdAt.toISOString() }, 201)
})
