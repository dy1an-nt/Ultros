"use client"
import { Fragment, useState } from "react"
import { useDatasetRun, useDatasetRunRows } from "@/hooks/useDatasetRun"
import { ShareButton } from "@/components/share/ShareButton"
import type { DatasetRunRowItem } from "@/types/dataset"

const ROWS_PAGE = 50

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-blue-900 text-blue-300",
    complete: "bg-green-900 text-green-300",
    failed: "bg-red-900 text-red-300",
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

function RowDetail({ row }: { row: DatasetRunRowItem }) {
  return (
    <div className="bg-gray-950 rounded p-3 flex flex-col gap-2 text-xs">
      <div>
        <p className="text-gray-500 mb-1">Input</p>
        {Object.entries(row.input).map(([k, v]) => (
          <p key={k} className="text-gray-300">
            <span className="text-indigo-400">{k}:</span> {v}
          </p>
        ))}
      </div>
      {row.expectedOutput && (
        <div>
          <p className="text-gray-500 mb-1">Expected</p>
          <p className="text-gray-300 whitespace-pre-wrap">{row.expectedOutput}</p>
        </div>
      )}
      <div>
        <p className="text-gray-500 mb-1">{row.finishReason === "error" ? "Error" : "Response"}</p>
        <p className={`whitespace-pre-wrap ${row.finishReason === "error" ? "text-red-300" : "text-gray-200"}`}>
          {row.responseText}
        </p>
      </div>
    </div>
  )
}

export function DatasetRunView({ runId }: { runId: string }) {
  const { data: run, isLoading, error } = useDatasetRun(runId)
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const terminal = run?.status === "complete" || run?.status === "failed"
  const rowsQuery = useDatasetRunRows(runId, offset, ROWS_PAGE, terminal)

  if (isLoading) return <div className="h-24 bg-gray-800 rounded-lg animate-pulse" />
  if (error) return <div className="text-sm text-red-400 py-4">Failed to load run: {error.message}</div>
  if (!run) return null

  const done = run.completedRows + run.failedRows
  const pct = run.totalRows > 0 ? Math.round((done / run.totalRows) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <StatusBadge status={run.status} />
        <span className="text-sm text-gray-400">
          {run.model} · {run.totalRows} rows{run.failedRows > 0 ? ` · ${run.failedRows} failed` : ""}
        </span>
        {terminal && (
          <span className="ml-auto flex items-center gap-3">
            <ShareButton resourceType="datasetRun" resourceId={run.id} />
            <a
              href={`/api/dataset-runs/${run.id}/export`}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Export CSV
            </a>
          </span>
        )}
      </div>

      {!terminal && (
        <div className="flex flex-col gap-1">
          <div className="h-2 bg-gray-800 rounded overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-500">
            {done}/{run.totalRows} rows ({pct}%) — judge evals may finish after the last row
          </p>
        </div>
      )}

      {run.error && <p className="text-sm text-red-400">{run.error}</p>}

      {terminal && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Avg score" value={run.avgScore !== null ? run.avgScore.toFixed(3) : "—"} />
          <Stat label="Pass rate" value={run.passRate !== null ? `${Math.round(run.passRate * 100)}%` : "—"} />
          <Stat label="Variance" value={run.scoreVariance !== null ? run.scoreVariance.toFixed(4) : "—"} />
          <Stat label="Avg latency" value={run.avgLatencyMs !== null ? `${run.avgLatencyMs} ms` : "—"} />
          <Stat label="Total cost" value={`$${run.totalCostUsd.toFixed(4)}`} />
        </div>
      )}

      {terminal &&
        (rowsQuery.isLoading ? (
          <div className="h-32 bg-gray-800 rounded-lg animate-pulse" />
        ) : rowsQuery.error ? (
          <div className="text-sm text-red-400">Failed to load rows: {rowsQuery.error.message}</div>
        ) : !rowsQuery.data || rowsQuery.data.rows.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">No row results.</div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-gray-400 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Response</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                    <th className="px-3 py-2 font-medium">Latency</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsQuery.data.rows.map((row) => (
                    <Fragment key={row.rowIndex}>
                      <tr
                        onClick={() => setExpanded(expanded === row.rowIndex ? null : row.rowIndex)}
                        className="border-t border-gray-800 text-gray-300 cursor-pointer hover:bg-gray-900"
                      >
                        <td className="px-3 py-2 text-gray-500">{row.rowIndex}</td>
                        <td className="px-3 py-2 max-w-md truncate">
                          {row.finishReason === "error" ? (
                            <span className="text-red-400">{row.responseText}</span>
                          ) : (
                            row.responseText
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.eval === null ? (
                            <span className="text-gray-600">—</span>
                          ) : row.eval.status !== "complete" ? (
                            <span className="text-gray-500">{row.eval.status}</span>
                          ) : (
                            <span className={row.eval.passed ? "text-green-400" : "text-red-400"}>
                              {row.eval.totalScore?.toFixed(2)} {row.eval.passed ? "✓" : "✗"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{row.latencyMs} ms</td>
                        <td className="px-3 py-2 text-gray-500">${row.costUsd.toFixed(4)}</td>
                      </tr>
                      {expanded === row.rowIndex && (
                        <tr className="border-t border-gray-800">
                          <td colSpan={5} className="px-3 py-2">
                            <RowDetail row={row} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <button
                onClick={() => setOffset(Math.max(0, offset - ROWS_PAGE))}
                disabled={offset === 0}
                className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                Prev
              </button>
              <span>
                {offset + 1}–{Math.min(offset + ROWS_PAGE, rowsQuery.data.total)} of {rowsQuery.data.total}
              </span>
              <button
                onClick={() => setOffset(offset + ROWS_PAGE)}
                disabled={offset + ROWS_PAGE >= rowsQuery.data.total}
                className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        ))}
    </div>
  )
}
