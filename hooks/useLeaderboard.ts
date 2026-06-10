import { useQuery } from "@tanstack/react-query"
import type { LeaderboardRow } from "@/types/eval"

/** GET /api/prompts/:id/leaderboard?rubricId=optional — version leaderboard (complete evals only). */
export function useLeaderboard(promptId: string, rubricId?: string) {
  return useQuery<LeaderboardRow[]>({
    queryKey: ["leaderboard", promptId, rubricId ?? "all"],
    queryFn: async () => {
      const qs = rubricId ? `?rubricId=${encodeURIComponent(rubricId)}` : ""
      const res = await fetch(`/api/prompts/${promptId}/leaderboard${qs}`)
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`)
      return json.data as LeaderboardRow[]
    },
  })
}
