"use client"
import type { ExperimentDetailDto, ExperimentResultsDto } from "@/types/experiment"
import { versionLabel } from "./CellGrid"

// Per-criterion mean score, one column per cell — shows *where* a variant
// wins, not just that it wins.
export function CriterionBreakdown({
  experiment,
  results,
}: {
  experiment: ExperimentDetailDto
  results: ExperimentResultsDto
}) {
  if (results.criterionStats.length === 0) {
    return <div className="text-center py-6 text-gray-600 text-sm">No scored criteria yet.</div>
  }

  const cellKeys: { promptVersionId: string; model: string }[] = []
  for (const versionId of experiment.variantVersionIds) {
    for (const model of experiment.models) {
      if (results.criterionStats.some((s) => s.promptVersionId === versionId && s.model === model)) {
        cellKeys.push({ promptVersionId: versionId, model })
      }
    }
  }
  const criteria = [...new Set(results.criterionStats.map((s) => s.criterion))]

  return (
    <div className="rounded-lg border border-gray-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Criterion</th>
            {cellKeys.map((k) => (
              <th key={`${k.promptVersionId}-${k.model}`} className="px-3 py-2 font-medium">
                {versionLabel(experiment, k.promptVersionId)}
                <span className="block text-xs text-gray-600 font-normal">{k.model}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {criteria.map((criterion) => (
            <tr key={criterion} className="border-t border-gray-800 text-gray-300">
              <td className="px-3 py-2">{criterion}</td>
              {cellKeys.map((k) => {
                const stat = results.criterionStats.find(
                  (s) =>
                    s.criterion === criterion &&
                    s.promptVersionId === k.promptVersionId &&
                    s.model === k.model
                )
                return (
                  <td key={`${k.promptVersionId}-${k.model}`} className="px-3 py-2">
                    {stat ? (
                      <span className={stat.avgScore >= 0.5 ? "text-green-400" : "text-red-400"}>
                        {stat.avgScore.toFixed(3)}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
