import { auth } from "@clerk/nextjs/server"
import type { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse, type LimitClass } from "@/lib/rateLimit"
import { scopedRepos, type ScopedRepos } from "@/lib/db/repos"
import { logger } from "@/lib/logger"
import { ApiError, errorResponse, toErrorResponse } from "./errors"

// The protected-route boundary. Everything every authenticated handler did by
// hand, resolve the Clerk session, look up the DB user, apply the rate limit
// class, convert a thrown ApiError into the standard envelope, happens once
// here instead of fifteen lines into every route.
//
// The handler receives a user that exists, a repo scope bound to that user
// (lib/db/repos), and the resolved dynamic params. It signals failure by
// throwing ApiError, which is what makes the codes in lib/api/errors a single
// vocabulary rather than a per-route convention.

export type AuthedUser = { id: string; clerkId: string }

export type RouteContext<P> = {
  req: NextRequest
  params: P
  user: AuthedUser
  db: ScopedRepos
}

export type AuthedHandler<P> = (ctx: RouteContext<P>) => Promise<Response>

export type WithUserOptions = {
  // Omitted means unlimited, matching the routes that never called
  // checkRateLimit. Reads are generally unlimited; writes and launches are not.
  rateLimit?: LimitClass
}

// Next passes params as a Promise, and omits the context entirely for a route
// with no dynamic segment.
type NextRouteContext<P> = { params?: Promise<P> }

type RouteHandler<P> = (req: NextRequest, ctx?: NextRouteContext<P>) => Promise<Response>

export function withUser<P = Record<string, never>>(handler: AuthedHandler<P>): RouteHandler<P>
export function withUser<P = Record<string, never>>(
  options: WithUserOptions,
  handler: AuthedHandler<P>
): RouteHandler<P>
export function withUser<P>(
  optionsOrHandler: WithUserOptions | AuthedHandler<P>,
  maybeHandler?: AuthedHandler<P>
): RouteHandler<P> {
  const options = typeof optionsOrHandler === "function" ? {} : optionsOrHandler
  const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler!

  return async (req, ctx) => {
    try {
      const { userId: clerkId } = await auth()
      if (!clerkId) return errorResponse("UNAUTHORIZED")

      const user = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true, clerkId: true },
      })
      if (!user) return errorResponse("NOT_FOUND", "User not found")

      if (options.rateLimit) {
        const limited = await checkRateLimit(options.rateLimit, user.id)
        if (!limited.ok) return rateLimitResponse(limited)
      }

      const params = ((await ctx?.params) ?? {}) as P
      return await handler({ req, params, user, db: scopedRepos(user.id) })
    } catch (err) {
      if (err instanceof ApiError) return toErrorResponse(err)
      // Sentry's onRequestError only sees what escapes the handler, and this
      // catch is why nothing does. Report before collapsing to a generic 500.
      logger.exception("Unhandled API error", err, { path: req.nextUrl.pathname })
      Sentry.captureException(err)
      return toErrorResponse(err)
    }
  }
}

// Body parse at the boundary vocabulary: a malformed body is INVALID_JSON,
// never a 500.
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    throw new ApiError("INVALID_JSON")
  }
}
