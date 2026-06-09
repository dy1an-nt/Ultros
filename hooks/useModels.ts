import { useQuery } from "@tanstack/react-query"
import type { ModelInfo } from "@/types/models"

export function useModels() {
  return useQuery<ModelInfo[]>({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await fetch("/api/models")
      const json = await res.json()
      return json.data
    },
    staleTime: Infinity,
  })
}
