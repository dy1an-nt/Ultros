import type { ErrorCode } from "@/lib/api/errors"

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: { code: ErrorCode; message: string } }

export type PromptSummary = {
  id: string
  title: string
  description: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  _count: { versions: number; runs: number }
}

export type PromptVersionData = {
  id: string
  versionNumber: number
  label: string | null
  systemPrompt: string
  userPrompt: string
  variables: Record<string, string>
  createdAt: string
}

export type RunData = {
  id: string
  model: string
  provider: string
  temperature: number
  maxTokens: number
  inputTokens: number
  outputTokens: number
  latencyMs: number
  costUsd: number
  responseText: string
  finishReason: string | null
  createdAt: string
  promptVersion: { versionNumber: number; label: string | null }
}

export type PromptDetail = {
  id: string
  title: string
  description: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  versions: PromptVersionData[]
  _count: { runs: number }
}
