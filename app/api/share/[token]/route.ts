import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rateLimit"
import { resolveShareByToken } from "@/lib/share/resolve"
import { errorResponse, jsonOk } from "@/lib/api/errors"

// Public resolve, no auth, limited per IP. Unknown and revoked tokens return
// byte-identical 404s; capability URLs must not leak which guesses were close.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const limited = await checkRateLimit("sharePublic", clientIp(req))
  if (!limited.ok) return rateLimitResponse(limited)

  const share = await resolveShareByToken(token)
  if (!share) {
    return errorResponse("NOT_FOUND")
  }
  return Response.json(
    { data: share, error: null },
    { headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } }
  )
}

// Revoke, auth required, owner only, effective immediately (resolve never
// caches).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const share = await prisma.share.findUnique({ where: { token } })
  if (!share || share.userId !== user.id || share.revokedAt !== null) {
    return errorResponse("NOT_FOUND")
  }
  await prisma.share.update({ where: { id: share.id }, data: { revokedAt: new Date() } })
  return jsonOk({ token })
}
