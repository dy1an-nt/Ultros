import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  ExperimentDetailDto,
  ExperimentListItem,
  ExperimentResultsDto,
} from "@/types/experiment"
import type { DatasetRunRowItem } from "@/types/dataset"

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

export function useExperiments() {
  return useQuery<ExperimentListItem[]>({
    queryKey: ["experiments"],
    queryFn: async () => unwrap<ExperimentListItem[]>(await fetch("/api/experiments")),
  })
}

// Poll while cells are in flight; "complete" is the only terminal status.
export function useExperiment(id: string) {
  return useQuery<ExperimentDetailDto>({
    queryKey: ["experiment", id],
    queryFn: async () => unwrap<ExperimentDetailDto>(await fetch(`/api/experiments/${id}`)),
    refetchInterval: (query) => (query.state.data?.status === "complete" ? false : 2000),
  })
}

export function useExperimentResults(id: string, enabled: boolean) {
  return useQuery<ExperimentResultsDto>({
    queryKey: ["experimentResults", id],
    enabled,
    queryFn: async () => unwrap<ExperimentResultsDto>(await fetch(`/api/experiments/${id}/results`)),
  })
}

export function useExperimentCellRows(
  experimentId: string,
  cellId: string | null,
  offset: number,
  limit: number
) {
  return useQuery<{ rows: DatasetRunRowItem[]; total: number }>({
    queryKey: ["experimentCellRows", experimentId, cellId, offset, limit],
    enabled: cellId !== null,
    queryFn: async () =>
      unwrap<{ rows: DatasetRunRowItem[]; total: number }>(
        await fetch(`/api/experiments/${experimentId}/rows?cell=${cellId}&offset=${offset}&limit=${limit}`)
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
    mutationFn: async (input) => {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, confirm: true }),
      })
      return unwrap<ExperimentDetailDto>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments"] })
    },
  })
}
