import { NextRequest } from "next/server"

const BASE = "http://localhost:3000"

// Handlers only read method/body/URL from the request, so a bare NextRequest
// is a faithful stand-in for what the Next server would construct.
export function jsonRequest(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// For malformed-body cases: sends the string as-is, unencoded.
export function rawRequest(method: string, path: string, body: string): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  })
}

// Dynamic-segment context: Next 15 passes params as a Promise.
export function routeParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) }
}
