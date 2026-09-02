"use client"
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useDatasetRun } from "@/hooks/useDatasetRun"
import { useRunRegression } from "@/hooks/useRegression"
import { useBudgetGate } from "@/hooks/useSettings"
import type { BaselineDto } from "@/types/experiment"

type VersionListItem = { id: string; versionNumber: number; label: string | null }

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

// Launch a new version against the baseline; the baseline run's model is
// reused (regression compares prompts, not models).
export function RegressionTrigger({ promptId, baseline }: { promptId: string; baseline: BaselineDto }) {
  const queryClient = useQueryClient()
  const runRegression = useRunRegression(promptId)
  const budget = useBudgetGate()

  const versions = useQuery<VersionListItem[]>({
    queryKey: ["versions", promptId],
    queryFn: async () => unwrap<VersionListItem[]>(await fetch(`/api/prompts/${promptId}/versions`)),
  })

  const [versionId, setVersionId] = useState("")
  const [threshold, setThreshold] = useState(0.05)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const activeRun = useDatasetRun(activeRunId)

  const terminal = activeRun.data?.status === "complete" || activeRun.data?.status === "failed"
  useEffect(() => {
    if (!terminal || activeRunId === null) return
    // The verdict lands via the finalize hook, refresh the history feed once.
    queryClient.invalidateQueries({ queryKey: ["regressionHistory", promptId] })
    setActiveRunId(null)
  }, [terminal, activeRunId, promptId, queryClient])

  const done = activeRun.data ? activeRun.data.completedRows + activeRun.data.failedRows : 0
  const pct =
    activeRun.data && activeRun.data.totalRows > 0
      ? Math.round((done / activeRun.data.totalRows) * 100)
      : 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">Run regression check</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
        <select
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          className="bg-gray-800 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">New version…</option>
          {(versions.data ?? []).map((v) => (
            <option key={v.id} value={v.id}>v{v.versionNumber}{v.label ? `: ${v.label}` : ""}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          threshold
          <input
            type="number" min={0.01} max={0.5} step={0.01} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-20 bg-gray-800 text-white rounded px-2 py-1 outline-none"
          />
        </label>
        <span className="text-xs text-gray-600">
          vs v{baseline.versionNumber ?? "?"} on {baseline.model ?? "?"} (baseline {baseline.baselineScore.toFixed(3)})
        </span>
        <button
          onClick={() => {
            if (!budget.confirmIfOverBudget()) return
            runRegression.mutate(
              { newVersionId: versionId, threshold },
              { onSuccess: (result) => setActiveRunId(result.datasetRunId) }
            )
          }}
          disabled={versionId === "" || runRegression.isPending || activeRunId !== null}
          className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
        >
          {runRegression.isPending ? "Launching…" : "Run"}
        </button>
      </div>
      {runRegression.error && <p className="text-sm text-red-400">{runRegression.error.message}</p>}

      {activeRunId !== null && (
        <div className="flex flex-col gap-1">
          <div className="h-2 bg-gray-800 rounded overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-500">
            {done}/{activeRun.data?.totalRows ?? "?"} rows ({pct}%), verdict appears in the history below
          </p>
        </div>
      )}
    </div>
  )
}
