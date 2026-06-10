"use client"
import type { DatasetRowDto } from "@/types/dataset"

export function DatasetTable({
  columns,
  rows,
  total,
  offset,
  limit,
  onPage,
}: {
  columns: string[]
  rows: DatasetRowDto[]
  total: number
  offset: number
  limit: number
  onPage: (offset: number) => void
}) {
  if (rows.length === 0) {
    return <div className="text-center py-16 text-gray-600 text-sm">No rows.</div>
  }
  const hasExpected = rows.some((r) => r.expectedOutput !== null)

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">{c}</th>
              ))}
              {hasExpected && <th className="px-3 py-2 font-medium">expectedOutput</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-800 text-gray-300 align-top">
                <td className="px-3 py-2 text-gray-500">{row.rowIndex}</td>
                {columns.map((c) => (
                  <td key={c} className="px-3 py-2 max-w-xs truncate" title={row.data[c]}>
                    {row.data[c]}
                  </td>
                ))}
                {hasExpected && (
                  <td className="px-3 py-2 max-w-xs truncate text-gray-400" title={row.expectedOutput ?? ""}>
                    {row.expectedOutput}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <button
          onClick={() => onPage(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Prev
        </button>
        <span>
          {offset + 1}–{Math.min(offset + limit, total)} of {total}
        </span>
        <button
          onClick={() => onPage(offset + limit)}
          disabled={offset + limit >= total}
          className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
