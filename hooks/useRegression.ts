import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { BaselineDto, RegressionHistoryDto } from "@/types/experiment"
import { apiFetch, isApiError } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

// "No baseline" is a normal state, not an error, 404 maps to null.
export function useBaseline(promptId: string) {
  return useQuery<BaselineDto | null>({
    queryKey: queryKeys.baseline(promptId),
    queryFn: async () => {
      try {
        return await apiFetch<BaselineDto>(`/api/prompts/${promptId}/baseline`)
      } catch (err) {
        if (isApiError(err, 404)) return null
        throw err
      }
    },
  })
}

export type SetBaselineInput = { promptVersionId: string; datasetRunId: string }

export function useSetBaseline(promptId: string) {
  const queryClient = useQueryClient()
  return useMutation<BaselineDto, Error, SetBaselineInput>({
    mutationFn: (input) =>
      apiFetch<BaselineDto>(`/api/prompts/${promptId}/baseline`, { method: "POST", json: input }),
    onSuccess: (baseline) => {
      queryClient.setQueryData(queryKeys.baseline(promptId), baseline)
      queryClient.invalidateQueries({ queryKey: queryKeys.regressionHistory(promptId) })
    },
  })
}

export function useDeleteBaseline(promptId: string) {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, void>({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/api/prompts/${promptId}/baseline`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.baseline(promptId), null)
      queryClient.invalidateQueries({ queryKey: queryKeys.regressionHistory(promptId) })
    },
  })
}

export type RunRegressionInput = { newVersionId: string; threshold?: number }
export type RunRegressionResult = {
  datasetRunId: string
  regressionRunId: string
  baselineScore: number
}

export function useRunRegression(promptId: string) {
  const queryClient = useQueryClient()
  return useMutation<RunRegressionResult, Error, RunRegressionInput>({
    mutationFn: (input) =>
      apiFetch<RunRegressionResult>(`/api/prompts/${promptId}/regression`, {
        method: "POST",
        json: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.regressionHistory(promptId) })
    },
  })
}

// Polls while any run is pending, the server lazily finalizes stale ones.
export function useRegressionHistory(promptId: string) {
  return useQuery<RegressionHistoryDto>({
    queryKey: queryKeys.regressionHistory(promptId),
    queryFn: () => apiFetch<RegressionHistoryDto>(`/api/prompts/${promptId}/regression/history`),
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === "pending") ? 3000 : false,
  })
}
