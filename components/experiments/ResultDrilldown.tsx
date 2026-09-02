"use client"
import { Fragment, useState } from "react"
import { useExperimentCellRows } from "@/hooks/useExperiments"
import type { ExperimentDetailDto } from "@/types/experiment"
import type { DatasetRunRowItem } from "@/types/dataset"
import { versionLabel } from "./CellGrid"

const ROWS_PAGE = 50

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

// Pick a cell, see its rows. The same row shape as the dataset run view.
export function ResultDrilldown({ experiment }: { experiment: ExperimentDetailDto }) {
  const [cellId, setCellId] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const rowsQuery = useExperimentCellRows(experiment.id, cellId, offset, ROWS_PAGE)

  return (
    <div className="flex flex-col gap-3">
      <select
        value={cellId ?? ""}
        onChange={(e) => {
          setCellId(e.target.value || null)
          setOffset(0)
          setExpanded(null)
        }}
        className="self-start bg-gray-800 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">Pick a cell to inspect…</option>
        {experiment.cells.map((c) => (
          <option key={c.datasetRunId} value={c.datasetRunId}>
            {versionLabel(experiment, c.promptVersionId)} · {c.model}
          </option>
        ))}
      </select>

      {cellId !== null &&
        (rowsQuery.isLoading ? (
          <div className="h-32 bg-gray-800 rounded-lg animate-pulse" />
        ) : rowsQuery.error ? (
          <div className="text-sm text-red-400">Failed to load rows: {rowsQuery.error.message}</div>
        ) : !rowsQuery.data || rowsQuery.data.rows.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">No row results yet.</div>
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
                            <span className="text-gray-600">, </span>
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
