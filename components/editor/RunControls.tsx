"use client"
import { useState } from "react"
import { useModels } from "@/hooks/useModels"
import { useBudgetGate } from "@/hooks/useSettings"

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "GPT (OpenAI)",
  google: "Gemini (Google)",
  openrouter: "OpenRouter",
  ollama: "Ollama (local)",
}

const FALLBACK_DEFAULT_MODEL = "claude-haiku-4-5"

interface Props {
  onRun: (model: string, temperature: number, maxTokens: number) => Promise<void>
  onSaveVersion: () => Promise<void>
}

export function RunControls({ onRun, onSaveVersion }: Props) {
  const { data: models = [], isLoading: modelsLoading } = useModels()
  const [model, setModel] = useState(FALLBACK_DEFAULT_MODEL)
  const [temperature, setTemperature] = useState(1.0)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const budget = useBudgetGate()

  // The catalog is filtered to configured providers, so the hardcoded default
  // may not exist, fall back to the first available model.
  const effectiveModel = models.some((m) => m.id === model) ? model : models[0]?.id ?? model
  // Newer Claude models removed the sampling parameters. The run drops
  // temperature for them, so showing a live slider would be a lie.
  const sampled = models.find((m) => m.id === effectiveModel)?.supportsSampling ?? true

  const grouped = models.reduce<Record<string, typeof models>>((acc, m) => {
    ;(acc[m.provider] ??= []).push(m)
    return acc
  }, {})

  async function handleRun() {
    if (!budget.confirmIfOverBudget()) return
    setRunning(true)
    try {
      await onRun(effectiveModel, temperature, maxTokens)
    } finally {
      setRunning(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSaveVersion()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">Model</label>
          <select
            value={effectiveModel}
            onChange={(e) => setModel(e.target.value)}
            disabled={modelsLoading || running}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          >
            {modelsLoading ? (
              <option value={FALLBACK_DEFAULT_MODEL}>Loading models…</option>
            ) : models.length === 0 ? (
              <option value={FALLBACK_DEFAULT_MODEL}>No models available</option>
            ) : (
              Object.entries(grouped).map(([provider, providerModels]) => (
                <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </optgroup>
              ))
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {sampled ? `Temp: ${temperature.toFixed(1)}` : "Temp: n/a"}
          </label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            disabled={!sampled}
            title={sampled ? undefined : "This model does not accept a temperature"}
            className="w-28 disabled:opacity-40"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Max Tokens</label>
          <input
            type="number"
            min={1}
            max={4096}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 1024)}
            className="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleRun}
          disabled={running}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {running ? "Running..." : "▶ Run"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Version"}
        </button>
      </div>
    </div>
  )
}
