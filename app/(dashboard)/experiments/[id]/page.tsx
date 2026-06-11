"use client"
import { use } from "react"
import Link from "next/link"
import { useExperiment, useExperimentResults } from "@/hooks/useExperiments"
import { CellGrid, versionLabel } from "@/components/experiments/CellGrid"
import { WinMatrix } from "@/components/experiments/WinMatrix"
import { CriterionBreakdown } from "@/components/experiments/CriterionBreakdown"
import { ResultDrilldown } from "@/components/experiments/ResultDrilldown"
import { ShareButton } from "@/components/share/ShareButton"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </div>
  )
}

export default function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: experiment, isLoading, error } = useExperiment(id)
  const complete = experiment?.status === "complete"
  const results = useExperimentResults(id, complete === true)

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-40 bg-gray-800 rounded-lg animate-pulse" />
      </div>
    )
  }
  if (error) {
    return <div className="p-6 text-sm text-red-400">Failed to load experiment: {error.message}</div>
  }
  if (!experiment) return null

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/experiments" className="text-sm text-gray-500 hover:text-gray-300">
          ← Experiments
        </Link>
        <h1 className="text-2xl font-bold text-white">{experiment.name}</h1>
        {complete && (
          <span className="ml-auto">
            <ShareButton resourceType="experiment" resourceId={experiment.id} />
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500">
        {experiment.datasetName ?? "dataset"} · rubric {experiment.rubricName ?? "—"} ·{" "}
        {experiment.variantVersionIds.map((v) => versionLabel(experiment, v)).join(", ")}
      </p>

      <Section title="Cells">
        <CellGrid experiment={experiment} />
        {!complete && (
          <p className="text-xs text-gray-500">
            Running — results, win matrix and breakdowns appear when every cell finishes.
          </p>
        )}
      </Section>

      {complete &&
        (results.isLoading ? (
          <div className="h-40 bg-gray-800 rounded-lg animate-pulse" />
        ) : results.error ? (
          <div className="text-sm text-red-400">Failed to load results: {results.error.message}</div>
        ) : results.data ? (
          <>
            <Section title="Results per cell">
              {results.data.results.length === 0 ? (
                <div className="text-center py-6 text-gray-600 text-sm">No cell results recorded.</div>
              ) : (
                <div className="rounded-lg border border-gray-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-900 text-gray-400 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Variant</th>
                        <th className="px-3 py-2 font-medium">Model</th>
                        <th className="px-3 py-2 font-medium">Avg score</th>
                        <th className="px-3 py-2 font-medium">Variance</th>
                        <th className="px-3 py-2 font-medium">Pass rate</th>
                        <th className="px-3 py-2 font-medium">Latency</th>
                        <th className="px-3 py-2 font-medium">Cost</th>
                        <th className="px-3 py-2 font-medium">Scored rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.data.results.map((r) => (
                        <tr key={`${r.promptVersionId}-${r.model}`} className="border-t border-gray-800 text-gray-300">
                          <td className="px-3 py-2">{versionLabel(experiment, r.promptVersionId)}</td>
                          <td className="px-3 py-2 text-gray-500">{r.model}</td>
                          <td className="px-3 py-2">
                            {r.cellStatus === "failed" ? (
                              <span className="px-2 py-0.5 rounded text-xs bg-red-900 text-red-300">failed</span>
                            ) : r.avgScore !== null ? (
                              r.avgScore.toFixed(3)
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {r.scoreVariance !== null ? r.scoreVariance.toFixed(4) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {r.passRate !== null ? `${Math.round(r.passRate * 100)}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {r.avgLatencyMs !== null ? `${r.avgLatencyMs} ms` : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-500">${r.totalCostUsd.toFixed(4)}</td>
                          <td className="px-3 py-2">
                            {r.scoredRows}
                            {r.scoredRows < 10 && (
                              <span className="ml-2 px-2 py-0.5 rounded text-xs bg-yellow-900 text-yellow-300">
                                insufficient sample
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="Win matrix">
              <WinMatrix experiment={experiment} results={results.data} />
            </Section>

            <Section title="Per-criterion breakdown">
              <CriterionBreakdown experiment={experiment} results={results.data} />
            </Section>

            <Section title="Row drill-down">
              <ResultDrilldown experiment={experiment} />
            </Section>
          </>
        ) : null)}
    </div>
  )
}
