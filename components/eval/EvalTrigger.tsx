"use client"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRubrics } from "@/hooks/useRubrics"
import { useEval, useTriggerEval, isTerminalEvalStatus } from "@/hooks/useEval"
import { EvalResult } from "@/components/eval/EvalResult"
import { queryKeys } from "@/lib/api/queryKeys"

type Props = {
  runId: string
  promptId: string
}

export function EvalTrigger({ runId, promptId }: Props) {
  const [open, setOpen] = useState(false)
  const [rubricId, setRubricId] = useState("")
  const [evalId, setEvalId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const { data: rubrics, isLoading: rubricsLoading, error: rubricsError } = useRubrics()
  const trigger = useTriggerEval()
  const { data: evaluation, error: pollError } = useEval(evalId)

  // When a polled eval reaches a terminal state, refresh history + leaderboard.
  const status = evaluation?.status
  useEffect(() => {
    if (isTerminalEvalStatus(status)) {
      queryClient.invalidateQueries({ queryKey: queryKeys.evals(promptId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard(promptId) })
    }
  }, [status, promptId, queryClient])

  function handleEvaluate() {
    if (!rubricId) return
    trigger.mutate(
      { runId, rubricId, promptId },
      { onSuccess: (ev) => setEvalId(ev.id) }
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2.5 py-1 rounded bg-gray-800 text-indigo-300 hover:bg-gray-700 transition-colors"
      >
        Evaluate
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {rubricsLoading ? (
          <span className="text-xs text-gray-500 animate-pulse">Loading rubrics…</span>
        ) : rubricsError ? (
          <span className="text-xs text-red-400">Failed to load rubrics</span>
        ) : !rubrics || rubrics.length === 0 ? (
          <span className="text-xs text-gray-500">
            No rubrics yet, {" "}
            <Link href="/rubrics" className="text-indigo-400 hover:text-indigo-300">
              create one
            </Link>{" "}
            first.
          </span>
        ) : (
          <>
            <select
              className="text-xs border border-gray-700 rounded px-2 py-1 bg-gray-950 text-gray-100"
              value={rubricId}
              onChange={(e) => setRubricId(e.target.value)}
              disabled={trigger.isPending}
            >
              <option value="">Select rubric…</option>
              {rubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleEvaluate}
              disabled={!rubricId || trigger.isPending}
              className="text-xs px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {trigger.isPending ? "Starting…" : "Run eval"}
            </button>
          </>
        )}
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Close
        </button>
      </div>

      {trigger.error && <p className="text-xs text-red-400">{trigger.error.message}</p>}
      {pollError && <p className="text-xs text-red-400">Failed to load evaluation: {pollError.message}</p>}

      {evaluation && <EvalResult evaluation={evaluation} />}
    </div>
  )
}
