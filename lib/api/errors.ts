// Standardized API error envelope.
//
// The platform-wide response contract stays `{ data, error }` (see CLAUDE.md),
// but `error` is upgraded from a bare string to a structured object so clients
// can branch on a stable machine-readable `code` instead of matching on prose:
//
//   success: { data: <payload>, error: null }
//   failure: { data: null, error: { code, message } }
//
// `message` is always safe to surface to a user — it never carries a stack
// trace, a raw provider/DB error, or a secret. Use `internalError()` for
// unexpected failures so the caller gets a generic message while the real
// cause is logged server-side only.

export const ERROR_CODES = {
  UNAUTHORIZED: { status: 401, message: "Authentication required" },
  FORBIDDEN: { status: 403, message: "You do not have access to this resource" },
  NOT_FOUND: { status: 404, message: "Resource not found" },
  VALIDATION_ERROR: { status: 400, message: "Request validation failed" },
  INVALID_JSON: { status: 400, message: "Request body is not valid JSON" },
  RATE_LIMITED: { status: 429, message: "Rate limit exceeded" },
  CONFLICT: { status: 409, message: "Resource is in a conflicting state" },
  INTERNAL: { status: 500, message: "An unexpected error occurred" },
  SERVICE_UNAVAILABLE: { status: 503, message: "Service temporarily unavailable" },
} as const

export type ErrorCode = keyof typeof ERROR_CODES

export type ApiErrorBody = { data: null; error: { code: ErrorCode; message: string } }

// Thrown inside route handlers / services; converted to a Response by
// `toErrorResponse` at the boundary. Carries a stable code and an optional
// user-safe message override.
export class ApiError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERROR_CODES[code].message)
    this.name = "ApiError"
    this.code = code
  }
  get status(): number {
    return ERROR_CODES[this.code].status
  }
}

export function errorBody(code: ErrorCode, message?: string): ApiErrorBody {
  return { data: null, error: { code, message: message ?? ERROR_CODES[code].message } }
}

// Build a JSON error Response in the standard envelope.
export function errorResponse(code: ErrorCode, message?: string): Response {
  return Response.json(errorBody(code, message), { status: ERROR_CODES[code].status })
}

// Build a JSON success Response in the standard envelope.
export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null }, { status })
}

// Boundary helper: map any thrown value to a safe Response. Known `ApiError`s
// pass their code/message through; anything else collapses to a generic 500 so
// internal details (stack traces, driver errors) never reach the client.
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return errorResponse(err.code, err.message)
  return errorResponse("INTERNAL")
}
