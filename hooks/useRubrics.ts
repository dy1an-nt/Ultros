import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Criterion, RubricDto } from "@/types/eval"

export type RubricInput = {
  name: string
  description: string | null
  passThreshold: number
  criteria: Criterion[]
}

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

export function useRubrics() {
  return useQuery<RubricDto[]>({
    queryKey: ["rubrics"],
    queryFn: async () => {
      const res = await fetch("/api/rubrics")
      return unwrap<RubricDto[]>(res)
    },
  })
}

export function useCreateRubric() {
  const queryClient = useQueryClient()
  return useMutation<RubricDto, Error, RubricInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return unwrap<RubricDto>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubrics"] })
    },
  })
}

export function useUpdateRubric() {
  const queryClient = useQueryClient()
  return useMutation<RubricDto, Error, { id: string } & RubricInput>({
    mutationFn: async ({ id, ...input }) => {
      const res = await fetch(`/api/rubrics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return unwrap<RubricDto>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubrics"] })
    },
  })
}

export function useDeleteRubric() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/rubrics/${id}`, { method: "DELETE" })
      return unwrap<{ id: string }>(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubrics"] })
    },
  })
}
