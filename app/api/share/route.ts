import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { resourceBelongsToUser } from "@/lib/share/resolve"

const RESOURCE_TYPES = ["promptRun", "datasetRun", "experiment"] as const

function shareUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return `${base.replace(/\/$/, "")}/share/${token}`
}

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const shares = await prisma.share.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  })
  return Response.json({
    data: shares.map((s) => ({
      id: s.id,
      token: s.token,
      url: shareUrl(s.token),
      resourceType: s.resourceType,
      resourceId: s.resourceId,
      createdAt: s.createdAt.toISOString(),
    })),
    error: null,
  })
}

// Idempotent per (user, resource): re-POST returns the existing live link.
// A revoked share gets a NEW token — the old URL must stay dead forever.
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const { resourceType, resourceId } = body
  if (typeof resourceType !== "string" || !(RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    return Response.json(
      { data: null, error: `resourceType must be one of: ${RESOURCE_TYPES.join(", ")}` },
      { status: 400 }
    )
  }
  if (typeof resourceId !== "string" || !resourceId) {
    return Response.json({ data: null, error: "resourceId is required" }, { status: 400 })
  }

  if (!(await resourceBelongsToUser(resourceType, resourceId, user.id))) {
    return Response.json({ data: null, error: "Not found" }, { status: 404 })
  }

  const existing = await prisma.share.findUnique({
    where: {
      userId_resourceType_resourceId: { userId: user.id, resourceType, resourceId },
    },
  })

  if (existing && existing.revokedAt === null) {
    return Response.json({
      data: { token: existing.token, url: shareUrl(existing.token), createdAt: existing.createdAt.toISOString() },
      error: null,
    })
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

  return Response.json(
    { data: { token: share.token, url: shareUrl(share.token), createdAt: share.createdAt.toISOString() }, error: null },
    { status: 201 }
  )
}
