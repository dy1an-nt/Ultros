import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

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
    queryKey: queryKeys.usage(days),
    queryFn: () => apiFetch<UsageData>(`/api/usage?days=${days}`),
  })
}
