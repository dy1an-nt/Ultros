"use client"
import { useState } from "react"
import { useEvalHistory } from "@/hooks/useEvalHistory"
import { EvalResult, PassBadge, formatScore } from "@/components/eval/EvalResult"
import type { EvalStatus } from "@/types/eval"

const STATUS_STYLES: Record<EvalStatus, string> = {
  pending: "bg-amber-900/40 text-amber-400",
  running: "bg-amber-900/40 text-amber-400",
  complete: "bg-gray-800 text-gray-400",
  failed: "bg-red-900/50 text-red-400",
}

export function EvalHistory({ promptId }: { promptId: string }) {
  const { data: evals, isLoading, error } = useEvalHistory(promptId)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="text-sm text-red-400 py-4">Failed to load eval history: {error.message}</div>
  }

  if (!evals || evals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 text-sm">
        No evaluations yet — pick a run above and evaluate it against a rubric.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {evals.map((ev) => (
        <div key={ev.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded shrink-0">
                {ev.run.model.replace("claude-", "")}
              </span>
              <span className="text-xs text-gray-500 shrink-0">v{ev.run.versionNumber}</span>
              <span className="text-sm text-gray-400 truncate">
                {ev.criteriaSnapshot.rubricName}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <span className="text-sm font-medium text-white">{formatScore(ev.totalScore)}</span>
              <PassBadge passed={ev.passed} />
              {ev.status !== "complete" && (
                <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[ev.status]}`}>
                  {ev.status}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {new Date(ev.createdAt).toLocaleString()}
              </span>
            </div>
          </button>
          {expanded === ev.id && (
            <div className="px-3 pb-3 border-t border-gray-800 pt-3">
              <EvalResult evaluation={ev} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
