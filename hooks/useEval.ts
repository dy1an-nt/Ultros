import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { EvaluationDto } from "@/types/eval"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

export function isTerminalEvalStatus(status: string | undefined): boolean {
  return status === "complete" || status === "failed"
}

/**
 * POST /api/runs/:runId/eval, trigger an evaluation.
 * 200 → already complete (deterministic-only); 202 → pending (ai_judge queued).
 * Either way the response body is the Evaluation; we seed the poll cache with it.
 */
export function useTriggerEval() {
  const queryClient = useQueryClient()
  return useMutation<EvaluationDto, Error, { runId: string; rubricId: string; promptId: string }>({
    mutationFn: ({ runId, rubricId }) =>
      apiFetch<EvaluationDto>(`/api/runs/${runId}/eval`, { method: "POST", json: { rubricId } }),
    onSuccess: (evaluation, { promptId }) => {
      queryClient.setQueryData(queryKeys.evaluation(evaluation.id), evaluation)
      queryClient.invalidateQueries({ queryKey: queryKeys.evals(promptId) })
    },
  })
}

/**
 * GET /api/evals/:id. Polls every 2s while the evaluation is pending/running,
 * stops once status is "complete" or "failed".
 */
export function useEval(evalId: string | null) {
  return useQuery<EvaluationDto>({
    queryKey: queryKeys.evaluation(evalId),
    enabled: !!evalId,
    queryFn: () => apiFetch<EvaluationDto>(`/api/evals/${evalId}`),
    refetchInterval: (query) =>
      isTerminalEvalStatus(query.state.data?.status) ? false : 2000,
  })
}
