import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { DatasetDto, DatasetDetailDto } from "@/types/dataset"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

export function useDatasets() {
  return useQuery<DatasetDto[]>({
    queryKey: queryKeys.datasets(),
    queryFn: () => apiFetch<DatasetDto[]>("/api/datasets"),
  })
}

export function useDataset(id: string, offset: number, limit: number) {
  return useQuery<DatasetDetailDto>({
    queryKey: queryKeys.dataset(id, offset, limit),
    queryFn: () => apiFetch<DatasetDetailDto>(`/api/datasets/${id}?offset=${offset}&limit=${limit}`),
  })
}

export type CreateDatasetInput = {
  name: string
  description: string | null
  csvText?: string
  rows?: Record<string, unknown>[]
}

export function useCreateDataset() {
  const queryClient = useQueryClient()
  return useMutation<DatasetDto, Error, CreateDatasetInput>({
    mutationFn: (input) => apiFetch<DatasetDto>("/api/datasets", { method: "POST", json: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets() })
    },
  })
}

export function useDeleteDataset() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) => apiFetch<{ id: string }>(`/api/datasets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets() })
    },
  })
}
