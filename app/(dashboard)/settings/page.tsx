"use client"
import { useEffect, useState } from "react"
import { useSettings, useUpdateBudget } from "@/hooks/useSettings"
import { ShareList } from "@/components/share/ShareList"

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings()
  const update = useUpdateBudget()
  const [input, setInput] = useState("")

  useEffect(() => {
    if (data) setInput(data.monthlyBudgetUsd !== null ? String(data.monthlyBudgetUsd) : "")
  }, [data])

  const parsed = input.trim() === "" ? null : Number(input)
  const valid = parsed === null || (Number.isFinite(parsed) && parsed > 0)

  return (
    <div className="p-6 flex flex-col gap-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Monthly budget</h2>
        {isLoading ? (
          <div className="h-16 bg-gray-800 rounded-lg animate-pulse" />
        ) : error ? (
          <p className="text-sm text-red-400">Failed to load settings: {error.message}</p>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-3">
            <p className="text-sm text-gray-400">
              This month: <span className="text-white">${(data?.monthSpendUsd ?? 0).toFixed(4)}</span>
              {data?.monthlyBudgetUsd != null && (
                <> of ${data.monthlyBudgetUsd.toFixed(2)} budget</>
              )}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Budget $</span>
              <input
                type="number"
                min={0}
                step={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="none"
                className="w-28 bg-gray-800 text-white rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => update.mutate(parsed)}
                disabled={!valid || update.isPending}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
              <span className="text-xs text-gray-600">
                Empty clears the budget. At 80% you get a banner; at 100% launches ask for
                confirmation — never a lockout.
              </span>
            </div>
            {update.error && <p className="text-sm text-red-400">{update.error.message}</p>}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Usage export</h2>
        <p className="text-sm text-gray-400">
          Download your daily usage (runs, tokens, cost) as CSV.{" "}
          <a href="/api/usage/export" className="text-indigo-400 hover:text-indigo-300">
            Export all
          </a>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white">Share links</h2>
        <ShareList />
      </section>
    </div>
  )
}
