import { useQuery } from "@tanstack/react-query"
import type { EvalHistoryItem } from "@/types/eval"

/** GET /api/prompts/:id/evals — newest-first evaluations for the prompt's runs. */
export function useEvalHistory(promptId: string, limit = 50) {
  return useQuery<EvalHistoryItem[]>({
    queryKey: ["evals", promptId, limit],
    queryFn: async () => {
      const res = await fetch(`/api/prompts/${promptId}/evals?limit=${limit}`)
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`)
      return json.data as EvalHistoryItem[]
    },
  })
}
