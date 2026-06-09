"use client"
import type { ModelInfo, CompareSlotState } from "@/types/models"

type Props = {
  slotIndex: 0 | 1 | 2
  availableModels: ModelInfo[]
  slot: CompareSlotState
  onModelChange: (model: string) => void
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "GPT (OpenAI)",
  google: "Gemini (Google)",
  openrouter: "OpenRouter",
}

export function ComparePanel({ slotIndex, availableModels, slot, onModelChange }: Props) {
  const grouped = availableModels.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    ;(acc[m.provider] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-2 border border-gray-800 rounded-lg p-3 min-h-[400px] bg-gray-900">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Slot {slotIndex + 1}</span>
        <select
          className="flex-1 text-sm border border-gray-700 rounded px-2 py-1 bg-gray-950 text-gray-100"
          value={slot.model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={slot.status === "streaming"}
        >
          <option value="">Select model…</option>
          {Object.entries(grouped).map(([provider, models]) => (
            <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {slot.status === "streaming" && (
          <span className="text-xs text-blue-400 animate-pulse">Streaming…</span>
        )}
        {slot.status === "done" && (
          <span className="text-xs text-green-500">Done</span>
        )}
        {slot.status === "error" && (
          <span className="text-xs text-red-400">Error</span>
        )}
      </div>

      <pre className="flex-1 text-sm font-mono whitespace-pre-wrap break-words bg-gray-950 rounded p-2 min-h-[300px] overflow-auto text-gray-100">
        {slot.status === "error" ? (
          <span className="text-red-400">{slot.error ?? "An error occurred"}</span>
        ) : slot.output ? (
          slot.output
        ) : (
          <span className="text-gray-600">Output will appear here…</span>
        )}
      </pre>

      {slot.status === "done" && slot.stats && (
        <div className="flex gap-4 text-xs text-gray-500 border-t border-gray-800 pt-2">
          <span>{(slot.stats.inputTokens + slot.stats.outputTokens).toLocaleString()} tokens</span>
          <span>${slot.stats.costUsd.toFixed(6)}</span>
          <span>{slot.stats.latencyMs}ms</span>
        </div>
      )}
    </div>
  )
}
