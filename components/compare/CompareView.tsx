"use client"
import { useCompareStore } from "@/store/compareStore"
import { useCompareRun } from "@/hooks/useCompareRun"
import { useModels } from "@/hooks/useModels"
import { ComparePanel } from "./ComparePanel"

type Props = {
  promptVersionId: string
  variables?: Record<string, string>
}

export function CompareView({ promptVersionId, variables }: Props) {
  const { data: models = [], isLoading } = useModels()
  const { runCompare, slots } = useCompareRun()
  const { setSlotModel } = useCompareStore()

  const activeSlots = slots
    .map((s, i) => ({ slot: i as 0 | 1 | 2, model: s.model }))
    .filter((s) => s.model)

  const isRunning = slots.some((s) => s.status === "streaming")

  async function handleRunAll() {
    if (activeSlots.length === 0 || isRunning) return
    await runCompare({ promptVersionId, slots: activeSlots, variables })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Model Comparison</h2>
        <button
          onClick={handleRunAll}
          disabled={activeSlots.length === 0 || isRunning || isLoading}
          className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {isRunning ? "Running…" : "Run All"}
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading models…</div>
      ) : models.length === 0 ? (
        <div className="text-sm text-gray-500">No models available.</div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {slots.map((slot, i) => (
          <ComparePanel
            key={i}
            slotIndex={i as 0 | 1 | 2}
            availableModels={models}
            slot={slot}
            onModelChange={(model) => setSlotModel(i as 0 | 1 | 2, model)}
          />
        ))}
      </div>
    </div>
  )
}
