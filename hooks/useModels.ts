import { useQuery } from "@tanstack/react-query"
import type { ModelInfo } from "@/types/models"

export function useModels() {
  return useQuery<ModelInfo[]>({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await fetch("/api/models")
      if (!res.ok) throw new Error("Failed to load models")
      const json = await res.json()
      if (json.error || !Array.isArray(json.data)) throw new Error(json.error ?? "Failed to load models")
      return json.data
    },
    staleTime: Infinity,
  })
}
