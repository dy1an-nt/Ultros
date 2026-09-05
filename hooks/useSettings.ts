import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

export type BudgetStatus = {
  monthlyBudgetUsd: number | null
  monthSpendUsd: number
  monthStart: string
}

export function useSettings() {
  return useQuery<BudgetStatus>({
    queryKey: queryKeys.settings(),
    queryFn: () => apiFetch<BudgetStatus>("/api/settings"),
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()
  return useMutation<BudgetStatus, Error, number | null>({
    mutationFn: (monthlyBudgetUsd) =>
      apiFetch<BudgetStatus>("/api/settings", { method: "PATCH", json: { monthlyBudgetUsd } }),
    onSuccess: (status) => queryClient.setQueryData(queryKeys.settings(), status),
  })
}

// Budget gate for launch buttons: at 100% the launch needs an extra explicit
// confirmation (architect pin: an extra confirm, never a hard lockout).
export function useBudgetGate() {
  const { data } = useSettings()
  const ratio =
    data?.monthlyBudgetUsd != null && data.monthlyBudgetUsd > 0
      ? data.monthSpendUsd / data.monthlyBudgetUsd
      : null
  return {
    ratio,
    overBudget: ratio !== null && ratio >= 1,
    nearBudget: ratio !== null && ratio >= 0.8 && ratio < 1,
    confirmIfOverBudget(): boolean {
      if (ratio === null || ratio < 1) return true
      return window.confirm(
        "You are at 100% of your monthly budget, launch anyway? (Budgets never hard-lock your account. This is a deliberate-spend check.)"
      )
    },
  }
}
