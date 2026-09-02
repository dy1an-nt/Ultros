"use client"
import Link from "next/link"
import { useSettings } from "@/hooks/useSettings"

// 80% → warning, 100% → alert. Renders nothing without a budget set.
export function BudgetBanner() {
  const { data } = useSettings()
  if (!data || data.monthlyBudgetUsd === null || data.monthlyBudgetUsd <= 0) return null
  const ratio = data.monthSpendUsd / data.monthlyBudgetUsd
  if (ratio < 0.8) return null

  const over = ratio >= 1
  return (
    <div
      className={`px-4 py-2 text-sm flex items-center gap-2 ${
        over ? "bg-red-950 text-red-300 border-b border-red-900" : "bg-yellow-950 text-yellow-300 border-b border-yellow-900"
      }`}
    >
      <span>
        {over ? "Monthly budget reached" : "Approaching monthly budget"}: $
        {data.monthSpendUsd.toFixed(2)} of ${data.monthlyBudgetUsd.toFixed(2)} (
        {Math.round(ratio * 100)}%). New launches will ask for confirmation.
      </span>
      <Link href="/settings" className="underline hover:no-underline ml-auto shrink-0">
        Adjust budget
      </Link>
    </div>
  )
}
