import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export type BudgetStatus = {
  monthlyBudgetUsd: number | null
  monthSpendUsd: number
  monthStart: string
}

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

export function useSettings() {
  return useQuery<BudgetStatus>({
    queryKey: ["settings"],
    queryFn: async () => unwrap<BudgetStatus>(await fetch("/api/settings")),
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()
  return useMutation<BudgetStatus, Error, number | null>({
    mutationFn: async (monthlyBudgetUsd) => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudgetUsd }),
      })
      return unwrap<BudgetStatus>(res)
    },
    onSuccess: (status) => queryClient.setQueryData(["settings"], status),
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
