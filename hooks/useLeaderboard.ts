import { useQuery } from "@tanstack/react-query"
import type { LeaderboardRow } from "@/types/eval"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

/** GET /api/prompts/:id/leaderboard?rubricId=optional, version leaderboard (complete evals only). */
export function useLeaderboard(promptId: string, rubricId?: string) {
  return useQuery<LeaderboardRow[]>({
    queryKey: queryKeys.leaderboardFor(promptId, rubricId),
    queryFn: () => {
      const qs = rubricId ? `?rubricId=${encodeURIComponent(rubricId)}` : ""
      return apiFetch<LeaderboardRow[]>(`/api/prompts/${promptId}/leaderboard${qs}`)
    },
  })
}
