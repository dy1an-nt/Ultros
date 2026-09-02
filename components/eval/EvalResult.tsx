"use client"
import { useState } from "react"
import type { EvaluationDto } from "@/types/eval"

export function PassBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) return null
  return passed ? (
    <span className="text-xs font-medium bg-green-900/50 text-green-400 px-2 py-0.5 rounded">
      PASS
    </span>
  ) : (
    <span className="text-xs font-medium bg-red-900/50 text-red-400 px-2 py-0.5 rounded">FAIL</span>
  )
}

export function formatScore(score: number | null): string {
  return score === null ? ", " : `${(score * 100).toFixed(1)}%`
}

type Props = { evaluation: EvaluationDto }

export function EvalResult({ evaluation }: Props) {
  const [showReasoning, setShowReasoning] = useState(false)
  const inProgress = evaluation.status === "pending" || evaluation.status === "running"

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-950 p-3 space-y-3">
      {/* Header: score + pass/fail + status */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-lg font-bold text-white">{formatScore(evaluation.totalScore)}</span>
        <PassBadge passed={evaluation.passed} />
        {inProgress && (
          <span className="text-xs text-amber-400 animate-pulse">
            {evaluation.status === "pending" ? "Queued…" : "Judging…"}
          </span>
        )}
        {evaluation.status === "failed" && (
          <span className="text-xs font-medium bg-red-900/50 text-red-400 px-2 py-0.5 rounded">
            Eval failed
          </span>
        )}
        <span className="text-xs text-gray-500 ml-auto">
          {evaluation.criteriaSnapshot.rubricName} · threshold{" "}
          {(evaluation.criteriaSnapshot.passThreshold * 100).toFixed(0)}% · {evaluation.evalMethod}
        </span>
      </div>

      {evaluation.status === "failed" && evaluation.error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded p-2">
          {evaluation.error}
        </p>
      )}

      {/* Per-criterion table */}
      {evaluation.criteriaScores && evaluation.criteriaScores.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="text-left font-medium py-1.5 pr-3">Criterion</th>
              <th className="text-left font-medium py-1.5 pr-3">Type</th>
              <th className="text-right font-medium py-1.5 pr-3">Weight</th>
              <th className="text-right font-medium py-1.5 pr-3">Score</th>
              <th className="text-left font-medium py-1.5">Detail</th>
            </tr>
          </thead>
          <tbody>
            {evaluation.criteriaScores.map((cs) => (
              <tr key={cs.name} className="border-b border-gray-800/50 last:border-0">
                <td className="py-1.5 pr-3 text-gray-200">{cs.name}</td>
                <td className="py-1.5 pr-3 text-gray-500 text-xs">{cs.type}</td>
                <td className="py-1.5 pr-3 text-right text-gray-400">{cs.weight}</td>
                <td
                  className={`py-1.5 pr-3 text-right font-medium ${
                    cs.score >= 0.5 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {(cs.score * 100).toFixed(0)}%
                </td>
                <td className="py-1.5 text-gray-500 text-xs">{cs.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Judge reasoning (collapsible) */}
      {evaluation.aiEvalReasoning && (
        <div>
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {showReasoning ? "▾ Hide judge reasoning" : "▸ Show judge reasoning"}
          </button>
          {showReasoning && (
            <p className="text-sm text-gray-400 whitespace-pre-wrap mt-2 bg-gray-900 rounded p-2">
              {evaluation.aiEvalReasoning}
            </p>
          )}
        </div>
      )}

      {/* Judge footer */}
      {evaluation.judgeCostUsd !== null && (
        <div className="flex gap-4 text-xs text-gray-500 border-t border-gray-800 pt-2">
          {evaluation.judgeModel && <span>judge: {evaluation.judgeModel}</span>}
          <span>${evaluation.judgeCostUsd.toFixed(6)}</span>
        </div>
      )}
    </div>
  )
}
