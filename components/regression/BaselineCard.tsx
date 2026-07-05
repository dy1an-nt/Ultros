"use client"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useDatasets } from "@/hooks/useDatasets"
import { useDatasetRuns } from "@/hooks/useDatasetRun"
import { useBaseline, useSetBaseline, useDeleteBaseline } from "@/hooks/useRegression"

type VersionListItem = { id: string; versionNumber: number; label: string | null }

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

// Set a baseline by pointing at an existing complete, scored DatasetRun of a
// version — the user blesses numbers they have already seen.
function SetBaselineForm({ promptId, onDone }: { promptId: string; onDone: () => void }) {
  const datasets = useDatasets()
  const setBaseline = useSetBaseline(promptId)

  const versions = useQuery<VersionListItem[]>({
    queryKey: ["versions", promptId],
    queryFn: async () => unwrap<VersionListItem[]>(await fetch(`/api/prompts/${promptId}/versions`)),
  })

  const [versionId, setVersionId] = useState("")
  const [datasetId, setDatasetId] = useState("")
  const runs = useDatasetRuns(datasetId)

  const candidates = (runs.data ?? []).filter(
    (r) =>
      r.status === "complete" &&
      r.rubricId !== null &&
      r.avgScore !== null &&
      r.promptVersionId === versionId
  )
  const [runId, setRunId] = useState("")

  const selectClass =
    "bg-gray-800 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Pick a version, then a complete scored dataset run of that version to pin as the baseline.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select
          value={versionId}
          onChange={(e) => { setVersionId(e.target.value); setRunId("") }}
          className={selectClass}
        >
          <option value="">Version…</option>
          {(versions.data ?? []).map((v) => (
            <option key={v.id} value={v.id}>v{v.versionNumber}{v.label ? ` — ${v.label}` : ""}</option>
          ))}
        </select>
        <select
          value={datasetId}
          onChange={(e) => { setDatasetId(e.target.value); setRunId("") }}
          className={selectClass}
        >
          <option value="">Dataset…</option>
          {(datasets.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          disabled={versionId === "" || datasetId === ""}
          className={selectClass}
        >
          <option value="">Scored run…</option>
          {candidates.map((r) => (
            <option key={r.id} value={r.id}>
              {r.model} · score {r.avgScore?.toFixed(3)} · {new Date(r.createdAt).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>
      {versionId !== "" && datasetId !== "" && !runs.isLoading && candidates.length === 0 && (
        <p className="text-sm text-gray-500">
          No complete scored runs of that version on this dataset — launch one from the dataset page first.
        </p>
      )}
      {setBaseline.error && <p className="text-sm text-red-400">{setBaseline.error.message}</p>}
      <button
        onClick={() =>
          setBaseline.mutate(
            { promptVersionId: versionId, datasetRunId: runId },
            { onSuccess: onDone }
          )
        }
        disabled={runId === "" || setBaseline.isPending}
        className="self-start px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
      >
        {setBaseline.isPending ? "Setting…" : "Set baseline"}
      </button>
    </div>
  )
}

export function BaselineCard({ promptId }: { promptId: string }) {
  const { data: baseline, isLoading, error } = useBaseline(promptId)
  const deleteBaseline = useDeleteBaseline(promptId)
  const [replacing, setReplacing] = useState(false)

  if (isLoading) return <div className="h-24 bg-gray-800 rounded-lg animate-pulse" />
  if (error) return <div className="text-sm text-red-400">Failed to load baseline: {error.message}</div>

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Baseline</h2>
        {baseline && !replacing && (
          <div className="flex gap-3 text-sm">
            <button onClick={() => setReplacing(true)} className="text-gray-400 hover:text-white transition-colors">
              Replace
            </button>
            <button
              onClick={() => {
                if (window.confirm("Delete the baseline? Its regression history goes with it.")) {
                  deleteBaseline.mutate()
                }
              }}
              className="text-gray-600 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {deleteBaseline.error && (
        <p className="text-sm text-red-400">Delete failed: {deleteBaseline.error.message}</p>
      )}

      {!baseline || replacing ? (
        <SetBaselineForm promptId={promptId} onDone={() => setReplacing(false)} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Version</p>
            <p className="text-white">{baseline.versionNumber !== null ? `v${baseline.versionNumber}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Dataset</p>
            <p className="text-white truncate">{baseline.datasetName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Rubric · model</p>
            <p className="text-white truncate">
              {baseline.rubricName ?? "deleted rubric"} · {baseline.model ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Score</p>
            <p className="text-white">{baseline.baselineScore.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Pass rate</p>
            <p className="text-white">{Math.round(baseline.baselinePassRate * 100)}%</p>
          </div>
        </div>
      )}
    </div>
  )
}
