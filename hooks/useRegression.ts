import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { BaselineDto, RegressionHistoryDto } from "@/types/experiment"

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

// "No baseline" is a normal state, not an error — 404 maps to null.
export function useBaseline(promptId: string) {
  return useQuery<BaselineDto | null>({
    queryKey: ["baseline", promptId],
    queryFn: async () => {
      const res = await fetch(`/api/prompts/${promptId}/baseline`)
      if (res.status === 404) return null
      return unwrap<BaselineDto>(res)
    },
  })
}

export type SetBaselineInput = { promptVersionId: string; datasetRunId: string }

export function useSetBaseline(promptId: string) {
  const queryClient = useQueryClient()
  return useMutation<BaselineDto, Error, SetBaselineInput>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/prompts/${promptId}/baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return unwrap<BaselineDto>(res)
    },
    onSuccess: (baseline) => {
      queryClient.setQueryData(["baseline", promptId], baseline)
      queryClient.invalidateQueries({ queryKey: ["regressionHistory", promptId] })
    },
  })
}

export function useDeleteBaseline(promptId: string) {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/prompts/${promptId}/baseline`, { method: "DELETE" })
      return unwrap<{ id: string }>(res)
    },
    onSuccess: () => {
      queryClient.setQueryData(["baseline", promptId], null)
      queryClient.invalidateQueries({ queryKey: ["regressionHistory", promptId] })
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
    mutationFn: async (input) => {
      const res = await fetch(`/api/prompts/${promptId}/regression`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return unwrap<RunRegressionResult>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regressionHistory", promptId] })
    },
  })
}

// Polls while any run is pending — the server lazily finalizes stale ones.
export function useRegressionHistory(promptId: string) {
  return useQuery<RegressionHistoryDto>({
    queryKey: ["regressionHistory", promptId],
    queryFn: async () =>
      unwrap<RegressionHistoryDto>(await fetch(`/api/prompts/${promptId}/regression/history`)),
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === "pending") ? 3000 : false,
  })
}
