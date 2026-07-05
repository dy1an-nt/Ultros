import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { DatasetRunDto, DatasetRunRowItem, RunEstimate } from "@/types/dataset"

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

export function useDatasetRuns(datasetId: string) {
  return useQuery<DatasetRunDto[]>({
    queryKey: ["datasetRuns", datasetId],
    enabled: datasetId !== "",
    queryFn: async () => unwrap<DatasetRunDto[]>(await fetch(`/api/datasets/${datasetId}/runs`)),
  })
}

// Poll while the batch is in flight; stop on terminal status.
export function useDatasetRun(runId: string | null) {
  return useQuery<DatasetRunDto>({
    queryKey: ["datasetRun", runId],
    enabled: runId !== null,
    queryFn: async () => unwrap<DatasetRunDto>(await fetch(`/api/dataset-runs/${runId}`)),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "complete" || status === "failed" ? false : 2000
    },
  })
}

export function useDatasetRunRows(runId: string | null, offset: number, limit: number, enabled: boolean) {
  return useQuery<{ rows: DatasetRunRowItem[]; total: number }>({
    queryKey: ["datasetRunRows", runId, offset, limit],
    enabled: enabled && runId !== null,
    queryFn: async () =>
      unwrap<{ rows: DatasetRunRowItem[]; total: number }>(
        await fetch(`/api/dataset-runs/${runId}/rows?offset=${offset}&limit=${limit}`)
      ),
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
    mutationFn: async (input) => {
      const res = await fetch(`/api/datasets/${datasetId}/run-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return unwrap<RunEstimate>(res)
    },
  })
}

export function useLaunchDatasetRun(datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation<DatasetRunDto, Error, RunConfigInput>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/datasets/${datasetId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, confirm: true }),
      })
      return unwrap<DatasetRunDto>(res)
    },
    onSuccess: (run) => {
      queryClient.setQueryData(["datasetRun", run.id], run)
      queryClient.invalidateQueries({ queryKey: ["datasetRuns", datasetId] })
    },
  })
}
