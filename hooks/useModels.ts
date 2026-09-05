import { useQuery } from "@tanstack/react-query"
import type { ModelInfo } from "@/types/models"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

export function useModels() {
  return useQuery<ModelInfo[]>({
    queryKey: queryKeys.models(),
    queryFn: () => apiFetch<ModelInfo[]>("/api/models"),
    staleTime: Infinity,
  })
}
