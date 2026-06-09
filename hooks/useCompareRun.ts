import { useCompareStore } from "@/store/compareStore"

type SlotIndex = 0 | 1 | 2

function isSlotIndex(value: unknown): value is SlotIndex {
  return value === 0 || value === 1 || value === 2
}

export function useCompareRun() {
  const store = useCompareStore()

  async function runCompare(params: {
    promptVersionId: string
    slots: Array<{ slot: SlotIndex; model: string }>
    temperature?: number
    maxTokens?: number
    variables?: Record<string, string>
  }) {
    store.resetSlots()
    params.slots.forEach(({ slot }) => store.setSlotStatus(slot, "streaming"))

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      if (!res.ok || !res.body) {
        let message = "Request failed"
        try {
          const json = await res.json()
          if (json?.error) message = json.error
        } catch {
          // non-JSON error response — keep generic message
        }
        params.slots.forEach(({ slot }) => {
          store.setSlotStatus(slot, "error")
          store.setSlotError(slot, message)
        })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      // Local accumulator avoids reading stale store snapshots mid-stream
      const outputAccum: Record<SlotIndex, string> = { 0: "", 1: "", 2: "" }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            const slot: unknown = event.slot
            if (!isSlotIndex(slot)) continue
            if (event.type === "chunk") {
              outputAccum[slot] += event.text
              store.setSlotOutput(slot, outputAccum[slot])
            } else if (event.type === "done") {
              store.setSlotStatus(slot, "done")
              store.setSlotStats(slot, {
                runId: event.runId,
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                costUsd: event.costUsd,
                latencyMs: event.latencyMs,
              })
            } else if (event.type === "error") {
              store.setSlotStatus(slot, "error")
              store.setSlotError(slot, event.error)
            }
          } catch {
            // malformed line — skip
          }
        }
      }
    } catch {
      // network failure mid-stream — handled by the cleanup below
    } finally {
      // Any slot the server never resolved would stay "streaming" forever and
      // keep the Run button disabled.
      const { slots } = useCompareStore.getState()
      slots.forEach((slot, i) => {
        if (slot.status === "streaming") {
          store.setSlotStatus(i as SlotIndex, "error")
          store.setSlotError(i as SlotIndex, "Stream ended unexpectedly")
        }
      })
    }
  }

  return { runCompare, slots: store.slots }
}
