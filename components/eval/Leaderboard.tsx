"use client"
import { useState } from "react"
import { useLeaderboard } from "@/hooks/useLeaderboard"
import { useRubrics } from "@/hooks/useRubrics"

export function Leaderboard({ promptId }: { promptId: string }) {
  const [rubricId, setRubricId] = useState("")
  const { data: rubrics } = useRubrics()
  const { data: rows, isLoading, error } = useLeaderboard(promptId, rubricId || undefined)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-300">Version leaderboard</h3>
        <select
          className="text-sm border border-gray-700 rounded px-2 py-1 bg-gray-950 text-gray-100"
          value={rubricId}
          onChange={(e) => setRubricId(e.target.value)}
        >
          <option value="">All rubrics</option>
          {(rubrics ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-400 py-4">Failed to load leaderboard: {error.message}</div>
      ) : !rows || rows.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm">
          No completed evaluations yet — scores appear here once runs are evaluated.
        </div>
      ) : (
        <div className="border border-gray-800 rounded-lg bg-gray-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800 bg-gray-950/50">
                <th className="text-left font-medium px-3 py-2">Version</th>
                <th className="text-left font-medium px-3 py-2">Label</th>
                <th className="text-right font-medium px-3 py-2">Avg Score</th>
                <th className="text-right font-medium px-3 py-2">Pass Rate</th>
                <th className="text-right font-medium px-3 py-2">Evals</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => b.avgScore - a.avgScore)
                .map((row, i) => (
                  <tr
                    key={row.promptVersionId}
                    className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30"
                  >
                    <td className="px-3 py-2">
                      <span
                        className={
                          i === 0
                            ? "text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded font-medium"
                            : "text-gray-300"
                        }
                      >
                        v{row.versionNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 truncate max-w-[200px]">
                      {row.label ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-white">
                      {(row.avgScore * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">
                      {(row.passRate * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{row.evalCount}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
