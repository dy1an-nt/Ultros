import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rateLimit"
import { resolveShareByToken } from "@/lib/share/resolve"
import { withUser } from "@/lib/api/handler"
import { errorResponse, jsonOk } from "@/lib/api/errors"

// Public resolve, no auth, limited per IP. Unknown and revoked tokens return
// byte-identical 404s; capability URLs must not leak which guesses were close.
// The one route in app/api that is deliberately not wrapped in withUser.
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
export const DELETE = withUser<{ token: string }>(
  { rateLimit: "mutation" },
  async ({ params, db }) => {
    const share = await db.share.requireLiveByToken(params.token)
    await prisma.share.update({ where: { id: share.id }, data: { revokedAt: new Date() } })
    return jsonOk({ token: share.token })
  }
)
