"use client"
import { use, useState } from "react"
import { useDataset } from "@/hooks/useDatasets"
import { useDatasetRuns } from "@/hooks/useDatasetRun"
import { DatasetTable } from "@/components/datasets/DatasetTable"
import { RunConfigDialog } from "@/components/datasets/RunConfigDialog"
import { DatasetRunView } from "@/components/datasets/DatasetRunView"

const ROWS_PAGE = 50

export default function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [offset, setOffset] = useState(0)
  const [tab, setTab] = useState<"rows" | "runs">("rows")
  const [configuring, setConfiguring] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const { data: dataset, isLoading, error } = useDataset(id, offset, ROWS_PAGE)
  const runs = useDatasetRuns(id)

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-40 bg-gray-800 rounded-lg animate-pulse" />
      </div>
    )
  }
  if (error) {
    return <div className="p-6 text-sm text-red-400">Failed to load dataset: {error.message}</div>
  }
  if (!dataset) return null

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{dataset.name}</h1>
          <p className="text-sm text-gray-500">
            {dataset.rowCount} rows · {dataset.columns.join(", ")}
          </p>
        </div>
        {!configuring && (
          <button
            onClick={() => setConfiguring(true)}
            className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            Run prompt
          </button>
        )}
      </div>

      {configuring && (
        <RunConfigDialog
          dataset={dataset}
          onClose={() => setConfiguring(false)}
          onLaunched={(run) => {
            setConfiguring(false)
            setSelectedRunId(run.id)
            setTab("runs")
          }}
        />
      )}

      <div className="flex gap-1 border-b border-gray-800">
        {(["rows", "runs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${
              tab === t
                ? "text-white border-b-2 border-indigo-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "rows" && (
        <DatasetTable
          columns={dataset.columns}
          rows={dataset.rows}
          total={dataset.rowCount}
          offset={offset}
          limit={ROWS_PAGE}
          onPage={setOffset}
        />
      )}

      {tab === "runs" &&
        (runs.isLoading ? (
          <div className="h-24 bg-gray-800 rounded-lg animate-pulse" />
        ) : runs.error ? (
          <div className="text-sm text-red-400">Failed to load runs: {runs.error.message}</div>
        ) : !runs.data || runs.data.length === 0 ? (
          <div className="text-center py-16 text-gray-600 text-sm">
            No runs yet. Hit “Run prompt” to batch-test against this dataset.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {runs.data.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                    selectedRunId === run.id
                      ? "border-indigo-500 text-white bg-gray-900"
                      : "border-gray-800 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {run.model} · {new Date(run.createdAt).toLocaleString()} · {run.status}
                </button>
              ))}
            </div>
            {selectedRunId ? (
              <DatasetRunView runId={selectedRunId} />
            ) : (
              <p className="text-sm text-gray-600">Select a run to see results.</p>
            )}
          </div>
        ))}
    </div>
  )
}
