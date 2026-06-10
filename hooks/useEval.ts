import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { EvaluationDto } from "@/types/eval"

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json.data as T
}

export function isTerminalEvalStatus(status: string | undefined): boolean {
  return status === "complete" || status === "failed"
}

/**
 * POST /api/runs/:runId/eval — trigger an evaluation.
 * 200 → already complete (deterministic-only); 202 → pending (ai_judge queued).
 * Either way the response body is the Evaluation; we seed the poll cache with it.
 */
export function useTriggerEval() {
  const queryClient = useQueryClient()
  return useMutation<EvaluationDto, Error, { runId: string; rubricId: string; promptId: string }>({
    mutationFn: async ({ runId, rubricId }) => {
      const res = await fetch(`/api/runs/${runId}/eval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubricId }),
      })
      return unwrap<EvaluationDto>(res)
    },
    onSuccess: (evaluation, { promptId }) => {
      queryClient.setQueryData(["eval", evaluation.id], evaluation)
      queryClient.invalidateQueries({ queryKey: ["evals", promptId] })
    },
  })
}

/**
 * GET /api/evals/:id — polls every 2s while the evaluation is pending/running,
 * stops once status is "complete" or "failed".
 */
export function useEval(evalId: string | null) {
  return useQuery<EvaluationDto>({
    queryKey: ["eval", evalId],
    enabled: !!evalId,
    queryFn: async () => {
      const res = await fetch(`/api/evals/${evalId}`)
      return unwrap<EvaluationDto>(res)
    },
    refetchInterval: (query) =>
      isTerminalEvalStatus(query.state.data?.status) ? false : 2000,
  })
}
