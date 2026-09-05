import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  ExperimentDetailDto,
  ExperimentListItem,
  ExperimentResultsDto,
} from "@/types/experiment"
import type { DatasetRunRowItem } from "@/types/dataset"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

type RowPage = { rows: DatasetRunRowItem[]; total: number }

export function useExperiments() {
  return useQuery<ExperimentListItem[]>({
    queryKey: queryKeys.experiments(),
    queryFn: () => apiFetch<ExperimentListItem[]>("/api/experiments"),
  })
}

// Poll while cells are in flight; "complete" is the only terminal status.
export function useExperiment(id: string) {
  return useQuery<ExperimentDetailDto>({
    queryKey: queryKeys.experiment(id),
    queryFn: () => apiFetch<ExperimentDetailDto>(`/api/experiments/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "complete" ? false : 2000),
  })
}

export function useExperimentResults(id: string, enabled: boolean) {
  return useQuery<ExperimentResultsDto>({
    queryKey: queryKeys.experimentResults(id),
    enabled,
    queryFn: () => apiFetch<ExperimentResultsDto>(`/api/experiments/${id}/results`),
  })
}

export function useExperimentCellRows(
  experimentId: string,
  cellId: string | null,
  offset: number,
  limit: number
) {
  return useQuery<RowPage>({
    queryKey: queryKeys.experimentCellRows(experimentId, cellId, offset, limit),
    enabled: cellId !== null,
    queryFn: () =>
      apiFetch<RowPage>(
        `/api/experiments/${experimentId}/rows?cell=${cellId}&offset=${offset}&limit=${limit}`
      ),
  })
}

export type CreateExperimentInput = {
  name: string
  datasetId: string
  rubricId: string
  variantVersionIds: string[]
  models: string[]
  temperature: number
  maxTokens: number
}

export function useCreateExperiment() {
  const queryClient = useQueryClient()
  return useMutation<ExperimentDetailDto, Error, CreateExperimentInput>({
    mutationFn: (input) =>
      apiFetch<ExperimentDetailDto>("/api/experiments", {
        method: "POST",
        json: { ...input, confirm: true },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.experiments() })
    },
  })
}
