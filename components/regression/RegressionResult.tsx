"use client"
import { Fragment, useState } from "react"
import { useDatasetRunRows } from "@/hooks/useDatasetRun"
import type { RegressionHistoryDto, RegressionRunDto } from "@/types/experiment"

function RegressedRows({ run }: { run: RegressionRunDto }) {
  // Regressed rows are a subset of the new run's rows, pull one page big
  // enough for the 500-row dataset cap and filter by the flagged ids.
  const rowsQuery = useDatasetRunRows(run.datasetRunId, 0, 200, true)
  const flagged = new Set(run.regressedRowIds)

  if (rowsQuery.isLoading) return <div className="h-16 bg-gray-800 rounded animate-pulse" />
  if (rowsQuery.error) {
    return <p className="text-sm text-red-400">Failed to load rows: {rowsQuery.error.message}</p>
  }
  const rows = (rowsQuery.data?.rows ?? []).filter(
    (r) => r.datasetRowId !== null && flagged.has(r.datasetRowId)
  )
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">Flagged rows are beyond the first 200. Open the run export.</p>
  }
  return (
    <div className="bg-gray-950 rounded p-3 flex flex-col gap-3 text-xs">
      {rows.map((row) => (
        <div key={row.rowIndex} className="flex flex-col gap-1 border-b border-gray-800 last:border-0 pb-2 last:pb-0">
          <p className="text-gray-500">
            row {row.rowIndex} ·{" "}
            {row.eval?.status === "complete" ? (
              <span className={row.eval.passed ? "text-green-400" : "text-red-400"}>
                score {row.eval.totalScore?.toFixed(2)} {row.eval.passed ? "✓" : "✗"}
              </span>
            ) : (
              "unscored"
            )}
          </p>
          {Object.entries(row.input).map(([k, v]) => (
            <p key={k} className="text-gray-400 truncate">
              <span className="text-indigo-400">{k}:</span> {v}
            </p>
          ))}
          <p className={`whitespace-pre-wrap line-clamp-3 ${row.finishReason === "error" ? "text-red-300" : "text-gray-300"}`}>
            {row.responseText}
          </p>
        </div>
      ))}
    </div>
  )
}

export function RegressionResult({ history }: { history: RegressionHistoryDto }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (history.runs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 text-sm">
        No regression runs yet. Pick a version above and run a check.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Version</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Δ vs baseline</th>
            <th className="px-3 py-2 font-medium">Verdict</th>
            <th className="px-3 py-2 font-medium">Regressed rows</th>
          </tr>
        </thead>
        <tbody>
          {history.runs.map((run) => (
            <Fragment key={run.id}>
              <tr
                onClick={() =>
                  run.regressedRowIds.length > 0 && setExpanded(expanded === run.id ? null : run.id)
                }
                className={`border-t border-gray-800 text-gray-300 ${run.regressedRowIds.length > 0 ? "cursor-pointer hover:bg-gray-900" : ""}`}
              >
                <td className="px-3 py-2 text-gray-500">{new Date(run.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">v{run.versionNumber ?? "?"}</td>
                <td className="px-3 py-2">{run.newScore !== null ? run.newScore.toFixed(3) : "N/A"}</td>
                <td className="px-3 py-2">
                  {run.scoreDelta !== null ? (
                    <span className={run.scoreDelta < 0 ? "text-red-400" : "text-green-400"}>
                      {run.scoreDelta >= 0 ? "+" : ""}{run.scoreDelta.toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-gray-600">, </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {run.status === "pending" ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-900 text-blue-300">running</span>
                  ) : run.status === "failed" ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">no verdict</span>
                  ) : run.regressed ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-red-900 text-red-300">regressed</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-900 text-green-300">ok</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {run.status === "complete" ? run.regressedRowIds.length : "N/A"}
                </td>
              </tr>
              {expanded === run.id && (
                <tr className="border-t border-gray-800">
                  <td colSpan={6} className="px-3 py-2">
                    <RegressedRows run={run} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
