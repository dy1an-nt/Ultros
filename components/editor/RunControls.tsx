"use client"
import { useState } from "react"

const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — Fast & Cheap" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — Balanced" },
  { id: "claude-opus-4-7", label: "Opus 4.7 — Best Quality" },
]

interface Props {
  onRun: (model: string, temperature: number, maxTokens: number) => Promise<void>
  onSaveVersion: () => Promise<void>
}

export function RunControls({ onRun, onSaveVersion }: Props) {
  const [model, setModel] = useState("claude-haiku-4-5")
  const [temperature, setTemperature] = useState(1.0)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleRun() {
    setRunning(true)
    try {
      await onRun(model, temperature, maxTokens)
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
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Temp: {temperature.toFixed(1)}</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-28"
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
