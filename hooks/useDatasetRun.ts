import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { DatasetRunDto, DatasetRunRowItem, RunEstimate } from "@/types/dataset"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

type RowPage = { rows: DatasetRunRowItem[]; total: number }

export function useDatasetRuns(datasetId: string) {
  return useQuery<DatasetRunDto[]>({
    queryKey: queryKeys.datasetRuns(datasetId),
    enabled: datasetId !== "",
    queryFn: () => apiFetch<DatasetRunDto[]>(`/api/datasets/${datasetId}/runs`),
  })
}

// Poll while the batch is in flight; stop on terminal status.
export function useDatasetRun(runId: string | null) {
  return useQuery<DatasetRunDto>({
    queryKey: queryKeys.datasetRun(runId),
    enabled: runId !== null,
    queryFn: () => apiFetch<DatasetRunDto>(`/api/dataset-runs/${runId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "complete" || status === "failed" ? false : 2000
    },
  })
}

export function useDatasetRunRows(runId: string | null, offset: number, limit: number, enabled: boolean) {
  return useQuery<RowPage>({
    queryKey: queryKeys.datasetRunRows(runId, offset, limit),
    enabled: enabled && runId !== null,
    queryFn: () =>
      apiFetch<RowPage>(`/api/dataset-runs/${runId}/rows?offset=${offset}&limit=${limit}`),
  })
}

export type RunConfigInput = {
  promptVersionId: string
  model: string
  temperature: number
  maxTokens: number
  rubricId?: string | null
  variableMapping: Record<string, string>
}

export function useRunEstimate(datasetId: string) {
  return useMutation<RunEstimate, Error, RunConfigInput>({
    mutationFn: (input) =>
      apiFetch<RunEstimate>(`/api/datasets/${datasetId}/run-estimate`, {
        method: "POST",
        json: input,
      }),
  })
}

export function useLaunchDatasetRun(datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation<DatasetRunDto, Error, RunConfigInput>({
    mutationFn: (input) =>
      apiFetch<DatasetRunDto>(`/api/datasets/${datasetId}/run`, {
        method: "POST",
        json: { ...input, confirm: true },
      }),
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.datasetRun(run.id), run)
      queryClient.invalidateQueries({ queryKey: queryKeys.datasetRuns(datasetId) })
    },
  })
}
