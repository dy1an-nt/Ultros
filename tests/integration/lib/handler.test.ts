import { describe, it, expect, vi } from "vitest"
import * as Sentry from "@sentry/nextjs"
import { withUser } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"
import { signInAs } from "../helpers/clerk"
import { jsonRequest, routeParams } from "../helpers/request"
import { createUser, createPrompt } from "../helpers/seed"

// The boundary itself, exercised directly rather than through a route: the
// paths every handler now inherits, and the one path no route can reach on
// purpose (an unexpected throw).

const req = () => jsonRequest("GET", "/api/anything")

describe("withUser", () => {
  it("returns 401 before touching the database when signed out", async () => {
    const handler = vi.fn()
    const res = await withUser(handler)(req())
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 404 for a Clerk session with no synced user row", async () => {
    signInAs("clerk_never_synced")
    const handler = vi.fn()
    const res = await withUser(handler)(req())
    expect(res.status).toBe(404)
    expect((await res.json()).error.message).toBe("User not found")
    expect(handler).not.toHaveBeenCalled()
  })

  it("hands the handler a scope bound to the signed-in user", async () => {
    const user = await createUser()
    signInAs(user.clerkId)

    const res = await withUser(async ({ user: authed, db }) =>
      jsonOk({ id: authed.id, scoped: db.scope.userId })
    )(req())

    const { data } = await res.json()
    expect(data).toEqual({ id: user.id, scoped: user.id })
  })

  it("resolves dynamic params for the handler", async () => {
    const user = await createUser()
    signInAs(user.clerkId)

    const res = await withUser<{ id: string }>(async ({ params }) => jsonOk(params))(
      req(),
      routeParams({ id: "abc" })
    )

    expect((await res.json()).data).toEqual({ id: "abc" })
  })

  it("converts a thrown ApiError into the standard envelope", async () => {
    const user = await createUser()
    signInAs(user.clerkId)

    const res = await withUser(async () => {
      throw new ApiError("CONFLICT", "already running")
    })(req())

    expect(res.status).toBe(409)
    expect((await res.json()).error).toEqual({ code: "CONFLICT", message: "already running" })
  })

  it("reports an unexpected throw and collapses it to a generic 500", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const captured = vi.mocked(Sentry.captureException)
    captured.mockClear()

    const res = await withUser(async () => {
      throw new Error("connection terminated unexpectedly")
    })(req())

    expect(res.status).toBe(500)
    // The real cause is logged and reported, never returned.
    const { error } = await res.json()
    expect(error).toEqual({ code: "INTERNAL", message: "An unexpected error occurred" })
    expect(captured).toHaveBeenCalledOnce()
  })

  it("ownership failures from the scope carry the repo's verdict", async () => {
    const me = await createUser()
    const other = await createUser()
    const theirs = await createPrompt(other.id)
    signInAs(me.clerkId)

    const read = withUser<{ id: string }>(async ({ params, db }) =>
      jsonOk(await db.prompt.require(params.id))
    )

    expect((await read(req(), routeParams({ id: theirs.id }))).status).toBe(403)
    expect((await read(req(), routeParams({ id: "does-not-exist" }))).status).toBe(404)
  })
})
