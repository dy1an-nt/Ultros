import { useQuery } from "@tanstack/react-query"

type DailySummary = {
  date: string
  totalRuns: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
}

type UsageData = {
  summary: {
    totalRuns: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCostUsd: number
  }
  daily: DailySummary[]
}

export function useUsage(days = 30) {
  return useQuery<UsageData>({
    queryKey: ["usage", days],
    queryFn: async () => {
      const res = await fetch(`/api/usage?days=${days}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      return json.data
    },
  })
}
