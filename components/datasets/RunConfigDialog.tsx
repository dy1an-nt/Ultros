"use client"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useModels } from "@/hooks/useModels"
import { useRubrics } from "@/hooks/useRubrics"
import { useRunEstimate, useLaunchDatasetRun } from "@/hooks/useDatasetRun"
import { useBudgetGate } from "@/hooks/useSettings"
import type { DatasetDto, DatasetRunDto } from "@/types/dataset"

type PromptListItem = { id: string; title: string }
type VersionListItem = { id: string; versionNumber: number; label: string | null; systemPrompt: string; userPrompt: string }

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status})`)
  return json.data as T
}

function extractVars(systemPrompt: string, userPrompt: string): string[] {
  const found = new Set<string>()
  for (const m of `${systemPrompt}\n${userPrompt}`.matchAll(/\{\{([^}]+)\}\}/g)) found.add(m[1].trim())
  return [...found]
}

export function RunConfigDialog({
  dataset,
  onLaunched,
  onClose,
}: {
  dataset: DatasetDto
  onLaunched: (run: DatasetRunDto) => void
  onClose: () => void
}) {
  const models = useModels()
  const rubrics = useRubrics()
  const estimate = useRunEstimate(dataset.id)
  const launch = useLaunchDatasetRun(dataset.id)
  const budget = useBudgetGate()

  const prompts = useQuery<PromptListItem[]>({
    queryKey: ["prompts"],
    queryFn: async () => unwrap<PromptListItem[]>(await fetch("/api/prompts")),
  })

  const [promptId, setPromptId] = useState("")
  const versions = useQuery<VersionListItem[]>({
    queryKey: ["versions", promptId],
    enabled: promptId !== "",
    queryFn: async () => unwrap<VersionListItem[]>(await fetch(`/api/prompts/${promptId}/versions`)),
  })

  const [versionId, setVersionId] = useState("")
  const [model, setModel] = useState("")
  const [rubricId, setRubricId] = useState("")
  const [temperature, setTemperature] = useState(1.0)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)

  const version = versions.data?.find((v) => v.id === versionId)
  const templateVars = useMemo(
    () => (version ? extractVars(version.systemPrompt, version.userPrompt) : []),
    [version]
  )

  function selectVersion(id: string) {
    setVersionId(id)
    setConfirmed(false)
    estimate.reset()
    const v = versions.data?.find((x) => x.id === id)
    if (!v) return
    // Identity mapping pre-fill for vars that match a column
    const next: Record<string, string> = {}
    for (const tv of extractVars(v.systemPrompt, v.userPrompt)) {
      if (dataset.columns.includes(tv)) next[tv] = tv
    }
    setMapping(next)
  }

  const ready =
    versionId !== "" && model !== "" && templateVars.every((v) => mapping[v] !== undefined)

  const config = {
    promptVersionId: versionId,
    model,
    temperature,
    maxTokens,
    rubricId: rubricId || null,
    variableMapping: mapping,
  }

  const selectClass =
    "bg-gray-800 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">Run prompt across “{dataset.name}”</h2>

      {prompts.isLoading ? (
        <div className="h-8 bg-gray-800 rounded animate-pulse" />
      ) : prompts.error ? (
        <p className="text-sm text-red-400">Failed to load prompts: {prompts.error.message}</p>
      ) : !prompts.data || prompts.data.length === 0 ? (
        <p className="text-sm text-gray-500">No prompts yet — create one first.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select value={promptId} onChange={(e) => { setPromptId(e.target.value); setVersionId("") }} className={selectClass}>
            <option value="">Prompt…</option>
            {prompts.data.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <select value={versionId} onChange={(e) => selectVersion(e.target.value)} disabled={!promptId} className={selectClass}>
            <option value="">Version…</option>
            {(versions.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>v{v.versionNumber}{v.label ? ` — ${v.label}` : ""}</option>
            ))}
          </select>
          <select value={model} onChange={(e) => { setModel(e.target.value); setConfirmed(false); estimate.reset() }} className={selectClass}>
            <option value="">Model…</option>
            {(models.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))}
          </select>
          <select value={rubricId} onChange={(e) => setRubricId(e.target.value)} className={selectClass}>
            <option value="">No rubric (unscored)</option>
            {(rubrics.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3 items-center text-sm text-gray-400">
        <label className="flex items-center gap-1">
          temp
          <input
            type="number" min={0} max={2} step={0.1} value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-16 bg-gray-800 text-white rounded px-2 py-1 outline-none"
          />
        </label>
        <label className="flex items-center gap-1">
          maxTokens
          <input
            type="number" min={1} max={4096} value={maxTokens}
            onChange={(e) => { setMaxTokens(Number(e.target.value)); setConfirmed(false); estimate.reset() }}
            className="w-20 bg-gray-800 text-white rounded px-2 py-1 outline-none"
          />
        </label>
      </div>

      {templateVars.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500">Map template variables to dataset columns:</p>
          <div className="flex flex-wrap gap-2">
            {templateVars.map((tv) => (
              <label key={tv} className="flex items-center gap-1 text-sm text-gray-300">
                <code className="text-indigo-400">{"{{" + tv + "}}"}</code> →
                <select
                  value={mapping[tv] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [tv]: e.target.value })}
                  className={selectClass}
                >
                  <option value="">column…</option>
                  {dataset.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {estimate.data ? (
        <div className="bg-gray-800 rounded p-3 text-sm text-gray-300 flex flex-col gap-2">
          <p>
            {estimate.data.rowCount} rows · ~{estimate.data.estimatedInputTokens.toLocaleString()} input
            tokens · estimated cost <span className="text-white font-medium">
              ${estimate.data.estimatedCostUsd.toFixed(4)}</span> (upper bound; ≤ $
            {estimate.data.perRowCapUsd.toFixed(4)}/row)
          </p>
          <label className="flex items-center gap-2 text-gray-400">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I understand this will call the provider {estimate.data.rowCount} times.
          </label>
        </div>
      ) : (
        <button
          onClick={() => estimate.mutate(config)}
          disabled={!ready || estimate.isPending}
          className="self-start px-4 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 transition-colors"
        >
          {estimate.isPending ? "Estimating…" : "Estimate cost"}
        </button>
      )}
      {estimate.error && <p className="text-sm text-red-400">{estimate.error.message}</p>}
      {launch.error && <p className="text-sm text-red-400">{launch.error.message}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!budget.confirmIfOverBudget()) return
            launch.mutate(config, { onSuccess: onLaunched })
          }}
          disabled={!ready || !confirmed || !estimate.data || launch.isPending}
          className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
        >
          {launch.isPending ? "Launching…" : "Launch run"}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
