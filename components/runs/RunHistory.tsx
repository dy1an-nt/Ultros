"use client"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

type RunData = {
  id: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  costUsd: number
  responseText: string
  createdAt: string
  promptVersion: { versionNumber: number; label: string | null }
}

export function RunHistory({ promptId }: { promptId: string }) {
  const { data, isLoading } = useQuery<{ data: RunData[] }>({
    queryKey: ["runs", promptId],
    queryFn: () => fetch(`/api/prompts/${promptId}/runs`).then((r) => r.json()),
    refetchInterval: 3000,
  })
  const [expanded, setExpanded] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  const runs = data?.data ?? []

  if (!runs.length) {
    return (
      <div className="text-center py-8 text-gray-600 text-sm">
        No runs yet — hit Run to get started
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div key={run.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === run.id ? null : run.id)}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded shrink-0">
                {run.model.replace("claude-", "")}
              </span>
              <span className="text-xs text-gray-500 shrink-0">v{run.promptVersion.versionNumber}</span>
              <span className="text-sm text-gray-400 truncate">
                {run.responseText.slice(0, 80)}
              </span>
            </div>
            <div className="flex gap-3 text-xs text-gray-500 shrink-0 ml-2">
              <span>{run.inputTokens + run.outputTokens} tok</span>
              <span>{run.latencyMs}ms</span>
              <span>${run.costUsd.toFixed(5)}</span>
            </div>
          </button>
          {expanded === run.id && (
            <div className="px-3 pb-3 border-t border-gray-800 pt-2">
              <p className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                {run.responseText}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
