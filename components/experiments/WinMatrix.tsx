"use client"
import type { ExperimentDetailDto, ExperimentResultsDto } from "@/types/experiment"
import { versionLabel } from "./CellGrid"

// Pairwise difference of means per model. Descriptive only — no p-values in
// v1 by design; cells under 10 scored rows carry an insufficient-sample badge.
export function WinMatrix({
  experiment,
  results,
}: {
  experiment: ExperimentDetailDto
  results: ExperimentResultsDto
}) {
  if (results.winMatrix.length === 0) {
    return (
      <div className="text-center py-6 text-gray-600 text-sm">
        No comparable pairs — a win matrix needs at least two scored cells on one model.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">A</th>
            <th className="px-3 py-2 font-medium">B</th>
            <th className="px-3 py-2 font-medium">Δ mean (A − B)</th>
            <th className="px-3 py-2 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {results.winMatrix.map((entry) => (
            <tr key={`${entry.a}-${entry.b}-${entry.model}`} className="border-t border-gray-800 text-gray-300">
              <td className="px-3 py-2 text-gray-500">{entry.model}</td>
              <td className="px-3 py-2">{versionLabel(experiment, entry.a)}</td>
              <td className="px-3 py-2">{versionLabel(experiment, entry.b)}</td>
              <td className={`px-3 py-2 font-medium ${entry.meanDiff > 0 ? "text-green-400" : entry.meanDiff < 0 ? "text-red-400" : "text-gray-400"}`}>
                {entry.meanDiff >= 0 ? "+" : ""}{entry.meanDiff.toFixed(3)}
              </td>
              <td className="px-3 py-2">
                {entry.insufficientSample ? (
                  <span className="px-2 py-0.5 rounded text-xs bg-yellow-900 text-yellow-300">
                    insufficient sample
                  </span>
                ) : entry.meanDiff === 0 ? (
                  <span className="text-gray-500">tie</span>
                ) : (
                  <span className="text-gray-300">
                    {versionLabel(experiment, entry.meanDiff > 0 ? entry.a : entry.b)} leads
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
