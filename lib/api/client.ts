import type { ErrorCode } from "./errors"

// The browser half of the API contract. Every route answers with
// `{ data, error }` (lib/api/errors), so unwrapping it belongs in one place
// rather than in a private `unwrap` helper per hook.
//
// Server routes never import this: they build responses with jsonOk and
// throw ApiError. This is only for code running in the browser.

export class ApiRequestError extends Error {
  // Null when the failure never reached a route (a network drop, an HTML
  // error page from the edge), so callers can tell those apart from a
  // deliberate refusal.
  readonly code: ErrorCode | null
  readonly status: number

  constructor(message: string, code: ErrorCode | null, status: number) {
    super(message)
    this.name = "ApiRequestError"
    this.code = code
    this.status = status
  }
}

export function isApiError(err: unknown, status: number): err is ApiRequestError {
  return err instanceof ApiRequestError && err.status === status
}

type RequestOptions = Omit<RequestInit, "body"> & {
  // Serialized as the JSON body, with the content type set for you.
  json?: unknown
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...init } = options
  const requestHeaders = new Headers(headers)
  if (json !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json")
  }

  const res = await fetch(path, {
    ...init,
    headers: requestHeaders,
    body: json === undefined ? undefined : JSON.stringify(json),
  })

  let body: { data?: unknown; error?: { code?: ErrorCode; message?: string } } | null = null
  try {
    body = await res.json()
  } catch {
    // Validity is checked below after preserving any HTTP error status.
  }

  if (!res.ok || body?.error) {
    throw new ApiRequestError(
      body?.error?.message ?? `Request failed (${res.status})`,
      body?.error?.code ?? null,
      res.status
    )
  }

  if (typeof body !== "object" || body === null || !Object.hasOwn(body, "data")) {
    throw new ApiRequestError(`Invalid API response (${res.status})`, null, res.status)
  }

  return body.data as T
}
