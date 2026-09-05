import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Criterion, RubricDto } from "@/types/eval"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

export type RubricInput = {
  name: string
  description: string | null
  passThreshold: number
  criteria: Criterion[]
}

export function useRubrics() {
  return useQuery<RubricDto[]>({
    queryKey: queryKeys.rubrics(),
    queryFn: () => apiFetch<RubricDto[]>("/api/rubrics"),
  })
}

export function useCreateRubric() {
  const queryClient = useQueryClient()
  return useMutation<RubricDto, Error, RubricInput>({
    mutationFn: (input) => apiFetch<RubricDto>("/api/rubrics", { method: "POST", json: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rubrics() })
    },
  })
}

export function useUpdateRubric() {
  const queryClient = useQueryClient()
  return useMutation<RubricDto, Error, { id: string } & RubricInput>({
    mutationFn: ({ id, ...input }) =>
      apiFetch<RubricDto>(`/api/rubrics/${id}`, { method: "PATCH", json: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rubrics() })
    },
  })
}

export function useDeleteRubric() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, string>({
    mutationFn: (id) => apiFetch<{ id: string }>(`/api/rubrics/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rubrics() })
    },
  })
}
