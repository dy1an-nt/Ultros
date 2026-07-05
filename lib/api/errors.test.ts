import { describe, expect, it } from "vitest"
import { ApiError, ERROR_CODES, errorBody, errorResponse, jsonOk, toErrorResponse } from "./errors"

describe("errorBody", () => {
  it("wraps a code in the standard envelope with its default message", () => {
    expect(errorBody("NOT_FOUND")).toEqual({
      data: null,
      error: { code: "NOT_FOUND", message: ERROR_CODES.NOT_FOUND.message },
    })
  })

  it("allows a custom message override", () => {
    expect(errorBody("VALIDATION_ERROR", "rubricId is required")).toEqual({
      data: null,
      error: { code: "VALIDATION_ERROR", message: "rubricId is required" },
    })
  })
})

describe("ApiError", () => {
  it("maps a code to its HTTP status", () => {
    expect(new ApiError("FORBIDDEN").status).toBe(403)
    expect(new ApiError("RATE_LIMITED").status).toBe(429)
  })

  it("defaults its message to the code's default", () => {
    expect(new ApiError("UNAUTHORIZED").message).toBe(ERROR_CODES.UNAUTHORIZED.message)
  })

  it("keeps a custom message", () => {
    expect(new ApiError("CONFLICT", "already running").message).toBe("already running")
  })
})

describe("errorResponse / jsonOk", () => {
  it("sets the status from the code and returns the envelope", async () => {
    const res = errorResponse("UNAUTHORIZED")
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      data: null,
      error: { code: "UNAUTHORIZED", message: ERROR_CODES.UNAUTHORIZED.message },
    })
  })

  it("jsonOk wraps data with a null error and default 200", async () => {
    const res = jsonOk({ id: "x" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: "x" }, error: null })
  })

  it("jsonOk honors a custom status (e.g. 202 accepted)", () => {
    expect(jsonOk({ id: "x" }, 202).status).toBe(202)
  })
})

describe("toErrorResponse", () => {
  it("passes an ApiError's code and message through", async () => {
    const res = toErrorResponse(new ApiError("NOT_FOUND", "Evaluation not found"))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      data: null,
      error: { code: "NOT_FOUND", message: "Evaluation not found" },
    })
  })

  it("collapses an unknown throw to a generic 500 (no detail leak)", async () => {
    const res = toErrorResponse(new Error("connect ECONNREFUSED 10.0.0.1:5432 password=hunter2"))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe("INTERNAL")
    expect(body.error.message).toBe(ERROR_CODES.INTERNAL.message)
    expect(JSON.stringify(body)).not.toContain("hunter2")
  })

  it("collapses a non-Error throw to a generic 500", async () => {
    const res = toErrorResponse("boom")
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("INTERNAL")
  })
})
