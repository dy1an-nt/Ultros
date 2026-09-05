import { useQuery } from "@tanstack/react-query"
import type { EvalHistoryItem } from "@/types/eval"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

/** GET /api/prompts/:id/evals. Newest-first evaluations for the prompt's runs. */
export function useEvalHistory(promptId: string, limit = 50) {
  return useQuery<EvalHistoryItem[]>({
    queryKey: queryKeys.evalHistory(promptId, limit),
    queryFn: () => apiFetch<EvalHistoryItem[]>(`/api/prompts/${promptId}/evals?limit=${limit}`),
  })
}
