import { describe, it, expect, vi, afterEach } from "vitest"
import { apiFetch, isApiError, ApiRequestError } from "./client"

// The envelope contract from the browser's side: what apiFetch returns, and
// what it throws when a route refuses, since every hook now depends on both.

function respondWith(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// `.catch(e => e)` yields unknown, and every rejection here is the same type.
async function failureOf(promise: Promise<unknown>): Promise<ApiRequestError> {
  const err = await promise.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiRequestError)
  return err as ApiRequestError
}

describe("apiFetch", () => {
  it("returns the envelope's data, not the envelope", async () => {
    respondWith({ data: [{ id: "r1" }], error: null })
    await expect(apiFetch<{ id: string }[]>("/api/rubrics")).resolves.toEqual([{ id: "r1" }])
  })

  it("sends a json body with its content type, and nothing when there is none", async () => {
    respondWith({ data: { ok: true }, error: null })
    await apiFetch("/api/rubrics", { method: "POST", json: { name: "R" } })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe('{"name":"R"}')
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json")

    respondWith({ data: null, error: null })
    await apiFetch("/api/rubrics")
    expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBeUndefined()
  })

  it("throws the route's message and code so callers can branch on either", async () => {
    respondWith({ data: null, error: { code: "VALIDATION_ERROR", message: "invalid rubricId" } }, 400)

    const err = await failureOf(apiFetch("/api/run", { method: "POST" }))
    expect(err.message).toBe("invalid rubricId")
    expect(err.code).toBe("VALIDATION_ERROR")
    expect(err.status).toBe(400)
  })

  it("throws on an error envelope even when the status says ok", async () => {
    respondWith({ data: null, error: { code: "INTERNAL", message: "boom" } }, 200)
    await expect(apiFetch("/api/usage")).rejects.toThrow("boom")
  })

  it("falls back to the status when the body is not the envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502</html>", { status: 502 }))
    )

    const err = await failureOf(apiFetch("/api/usage"))
    expect(err.message).toBe("Request failed (502)")
    // Null code marks a failure that never reached a route handler.
    expect(err.code).toBeNull()
    expect(err.status).toBe(502)
  })

  it("rejects a successful response that is not the API envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>sign-in</html>", { status: 200 }))
    )

    const err = await failureOf(apiFetch("/api/prompts"))
    expect(err.message).toBe("Invalid API response (200)")
    expect(err.code).toBeNull()
    expect(err.status).toBe(200)
  })

  it("preserves a Headers instance when adding the JSON content type", async () => {
    respondWith({ data: { ok: true }, error: null })

    await apiFetch("/api/prompts", {
      method: "POST",
      headers: new Headers({ Authorization: "Bearer token" }),
      json: {},
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const sentHeaders = new Headers(init?.headers)
    expect(sentHeaders.get("Authorization")).toBe("Bearer token")
    expect(sentHeaders.get("Content-Type")).toBe("application/json")
  })

  it("identifies a status so callers can treat one as a normal state", async () => {
    respondWith({ data: null, error: { code: "NOT_FOUND", message: "no baseline set" } }, 404)

    const err = await failureOf(apiFetch("/api/prompts/p1/baseline"))
    // useBaseline maps exactly this to null rather than an error.
    expect(isApiError(err, 404)).toBe(true)
    expect(isApiError(err, 403)).toBe(false)
    expect(isApiError(new Error("network"), 404)).toBe(false)
  })
})
