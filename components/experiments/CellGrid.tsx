"use client"
import type { ExperimentDetailDto } from "@/types/experiment"

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

export function versionLabel(experiment: ExperimentDetailDto, versionId: string): string {
  const v = experiment.versions.find((x) => x.id === versionId)
  if (!v) return versionId.slice(0, 8)
  return `v${v.versionNumber}${v.label ? `: ${v.label}` : ""}`
}

// Live variants × models grid; each cell is one DatasetRun.
export function CellGrid({ experiment }: { experiment: ExperimentDetailDto }) {
  const cellFor = (versionId: string, model: string) =>
    experiment.cells.find((c) => c.promptVersionId === versionId && c.model === model)

  return (
    <div className="rounded-lg border border-gray-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Variant</th>
            {experiment.models.map((m) => (
              <th key={m} className="px-3 py-2 font-medium">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {experiment.variantVersionIds.map((versionId) => (
            <tr key={versionId} className="border-t border-gray-800">
              <td className="px-3 py-2 text-gray-300">{versionLabel(experiment, versionId)}</td>
              {experiment.models.map((model) => {
                const cell = cellFor(versionId, model)
                if (!cell) {
                  return (
                    <td key={model} className="px-3 py-2 text-gray-600">, </td>
                  )
                }
                const done = cell.completedRows + cell.failedRows
                return (
                  <td key={model} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={cell.status} />
                      <span className="text-xs text-gray-500">
                        {done}/{cell.totalRows}
                        {cell.failedRows > 0 ? ` (${cell.failedRows} failed)` : ""}
                      </span>
                    </div>
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
