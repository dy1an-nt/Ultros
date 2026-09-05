import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

// The prompt and version lists were fetched inline by five components and four
// pages, each with its own copy of the response types. One hook per query
// instead, so the cache key and the shape are decided once.

export type PromptSummary = {
  id: string
  title: string
  description: string | null
  tags: string[]
  createdAt: string
  _count: { versions: number; runs: number }
}

export type PromptVersionSummary = {
  id: string
  versionNumber: number
  label: string | null
  systemPrompt: string
  userPrompt: string
  createdAt: string
}

export function usePromptList() {
  return useQuery<PromptSummary[]>({
    queryKey: queryKeys.prompts(),
    queryFn: () => apiFetch<PromptSummary[]>("/api/prompts"),
  })
}

// Skips the request until a prompt is chosen: the pickers that use this start
// with no selection.
export function usePromptVersions(promptId: string) {
  return useQuery<PromptVersionSummary[]>({
    queryKey: queryKeys.versions(promptId),
    enabled: promptId !== "",
    queryFn: () => apiFetch<PromptVersionSummary[]>(`/api/prompts/${promptId}/versions`),
  })
}
