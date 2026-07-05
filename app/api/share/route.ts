import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { resourceBelongsToUser } from "@/lib/share/resolve"
import { errorResponse, jsonOk } from "@/lib/api/errors"

const RESOURCE_TYPES = ["promptRun", "datasetRun", "experiment"] as const

function shareUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return `${base.replace(/\/$/, "")}/share/${token}`
}

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const shares = await prisma.share.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  })
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
}

// Idempotent per (user, resource): re-POST returns the existing live link.
// A revoked share gets a NEW token — the old URL must stay dead forever.
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse("INVALID_JSON")
  }

  const { resourceType, resourceId } = body
  if (typeof resourceType !== "string" || !(RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    return errorResponse("VALIDATION_ERROR", `resourceType must be one of: ${RESOURCE_TYPES.join(", ")}`)
  }
  if (typeof resourceId !== "string" || !resourceId) {
    return errorResponse("VALIDATION_ERROR", "resourceId is required")
  }

  if (!(await resourceBelongsToUser(resourceType, resourceId, user.id))) {
    return errorResponse("NOT_FOUND")
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
}
