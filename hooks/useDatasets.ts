import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { DatasetDto, DatasetDetailDto } from "@/types/dataset"

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

export function useDatasets() {
  return useQuery<DatasetDto[]>({
    queryKey: ["datasets"],
    queryFn: async () => unwrap<DatasetDto[]>(await fetch("/api/datasets")),
  })
}

export function useDataset(id: string, offset: number, limit: number) {
  return useQuery<DatasetDetailDto>({
    queryKey: ["dataset", id, offset, limit],
    queryFn: async () =>
      unwrap<DatasetDetailDto>(await fetch(`/api/datasets/${id}?offset=${offset}&limit=${limit}`)),
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
    mutationFn: async (input) => {
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return unwrap<DatasetDto>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] })
    },
  })
}

export function useDeleteDataset() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/datasets/${id}`, { method: "DELETE" })
      return unwrap<{ id: string }>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] })
    },
  })
}
