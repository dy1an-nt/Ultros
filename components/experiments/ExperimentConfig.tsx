"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useModels } from "@/hooks/useModels"
import { usePromptList, usePromptVersions } from "@/hooks/usePrompts"
import { useRubrics } from "@/hooks/useRubrics"
import { useDatasets } from "@/hooks/useDatasets"
import { useCreateExperiment } from "@/hooks/useExperiments"
import { useBudgetGate } from "@/hooks/useSettings"
import { apiFetch } from "@/lib/api/client"
import type { RunEstimate } from "@/types/dataset"

const MAX_VARIANTS = 4
const MAX_MODELS = 3

export function ExperimentConfig() {
  const router = useRouter()
  const models = useModels()
  const rubrics = useRubrics()
  const datasets = useDatasets()
  const create = useCreateExperiment()
  const budget = useBudgetGate()

  const prompts = usePromptList()

  const [name, setName] = useState("")
  const [promptId, setPromptId] = useState("")
  const versions = usePromptVersions(promptId)

  const [variantIds, setVariantIds] = useState<string[]>([])
  const [modelIds, setModelIds] = useState<string[]>([])
  const [datasetId, setDatasetId] = useState("")
  const [rubricId, setRubricId] = useState("")
  const [temperature, setTemperature] = useState(1.0)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [estimate, setEstimate] = useState<{ totalUsd: number; cells: number } | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  function resetConfirmation() {
    setEstimate(null)
    setConfirmed(false)
    setEstimateError(null)
  }

  function toggle(list: string[], id: string, max: number): string[] {
    if (list.includes(id)) return list.filter((x) => x !== id)
    return list.length >= max ? list : [...list, id]
  }

  const cells = variantIds.length * modelIds.length
  const ready =
    name.trim().length > 0 && variantIds.length > 0 && modelIds.length > 0 && datasetId !== "" && rubricId !== ""

  // Per-cell estimate via the Sprint 4 endpoint: token counts barely differ
  // across variants of one prompt, prices differ across models, so estimate
  // the first variant on each model, then multiply by variant count.
  async function estimateCost() {
    setEstimating(true)
    setEstimateError(null)
    try {
      let perVariantUsd = 0
      for (const model of modelIds) {
        const data = await apiFetch<RunEstimate>(`/api/datasets/${datasetId}/run-estimate`, {
          method: "POST",
          json: { promptVersionId: variantIds[0], model, maxTokens },
        })
        perVariantUsd += data.estimatedCostUsd
      }
      setEstimate({ totalUsd: perVariantUsd * variantIds.length, cells })
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : "Estimate failed")
    } finally {
      setEstimating(false)
    }
  }

  const selectClass =
    "bg-gray-800 text-sm text-white rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
  const checkRow = (active: boolean) =>
    `flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
      active ? "bg-indigo-950 text-indigo-300" : "text-gray-400 hover:bg-gray-800"
    }`

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-4 max-w-3xl">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Experiment name…"
        className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {prompts.isLoading ? (
          <div className="h-8 bg-gray-800 rounded animate-pulse" />
        ) : prompts.error ? (
          <p className="text-sm text-red-400">Failed to load prompts: {prompts.error.message}</p>
        ) : !prompts.data || prompts.data.length === 0 ? (
          <p className="text-sm text-gray-500">No prompts yet. Create one first.</p>
        ) : (
          <select
            value={promptId}
            onChange={(e) => {
              setPromptId(e.target.value)
              setVariantIds([])
              resetConfirmation()
            }}
            className={selectClass}
          >
            <option value="">Prompt…</option>
            {prompts.data.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        )}
        <select
          value={datasetId}
          onChange={(e) => { setDatasetId(e.target.value); resetConfirmation() }}
          className={selectClass}
        >
          <option value="">Dataset…</option>
          {(datasets.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name} ({d.rowCount} rows)</option>
          ))}
        </select>
        <select
          value={rubricId}
          onChange={(e) => { setRubricId(e.target.value); resetConfirmation() }}
          className={selectClass}
        >
          <option value="">Rubric (required)…</option>
          {(rubrics.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {promptId !== "" && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-500">Up to {MAX_VARIANTS} versions to compare:</p>
          {versions.isLoading ? (
            <div className="h-8 bg-gray-800 rounded animate-pulse" />
          ) : versions.error ? (
            <p className="text-sm text-red-400">Failed to load versions: {versions.error.message}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(versions.data ?? []).map((v) => (
                <label key={v.id} className={checkRow(variantIds.includes(v.id))}>
                  <input
                    type="checkbox"
                    checked={variantIds.includes(v.id)}
                    onChange={() => { setVariantIds(toggle(variantIds, v.id, MAX_VARIANTS)); resetConfirmation() }}
                  />
                  v{v.versionNumber}{v.label ? `: ${v.label}` : ""}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-500">Up to {MAX_MODELS} models:</p>
        <div className="flex flex-wrap gap-2">
          {(models.data ?? []).map((m) => (
            <label key={m.id} className={checkRow(modelIds.includes(m.id))}>
              <input
                type="checkbox"
                checked={modelIds.includes(m.id)}
                onChange={() => { setModelIds(toggle(modelIds, m.id, MAX_MODELS)); resetConfirmation() }}
              />
              {m.displayName}
            </label>
          ))}
        </div>
      </div>

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
            onChange={(e) => { setMaxTokens(Number(e.target.value)); resetConfirmation() }}
            className="w-20 bg-gray-800 text-white rounded px-2 py-1 outline-none"
          />
        </label>
        {cells > 0 && (
          <span className="text-xs text-gray-500">
            {variantIds.length} variant{variantIds.length > 1 ? "s" : ""} × {modelIds.length} model
            {modelIds.length > 1 ? "s" : ""} = {cells} cells
          </span>
        )}
      </div>

      {estimate ? (
        <div className="bg-gray-800 rounded p-3 text-sm text-gray-300 flex flex-col gap-2">
          <p>
            {estimate.cells} cells · estimated total cost{" "}
            <span className="text-white font-medium">${estimate.totalUsd.toFixed(4)}</span> (upper bound)
          </p>
          <label className="flex items-center gap-2 text-gray-400">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I understand every cell runs the full dataset against a live model.
          </label>
        </div>
      ) : (
        <button
          onClick={estimateCost}
          disabled={!ready || estimating}
          className="self-start px-4 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 transition-colors"
        >
          {estimating ? "Estimating…" : "Estimate cost"}
        </button>
      )}
      {estimateError && <p className="text-sm text-red-400">{estimateError}</p>}
      {create.error && <p className="text-sm text-red-400">{create.error.message}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!budget.confirmIfOverBudget()) return
            create.mutate(
              {
                name: name.trim(),
                datasetId,
                rubricId,
                variantVersionIds: variantIds,
                models: modelIds,
                temperature,
                maxTokens,
              },
              { onSuccess: (experiment) => router.push(`/experiments/${experiment.id}`) }
            )
          }}
          disabled={!ready || !confirmed || !estimate || create.isPending}
          className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
        >
          {create.isPending ? "Launching…" : "Launch experiment"}
        </button>
        <button
          onClick={() => router.push("/experiments")}
          className="px-4 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
