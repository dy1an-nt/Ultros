import { useCompareStore } from "@/store/compareStore"

export function useCompareRun() {
  const store = useCompareStore()

  async function runCompare(params: {
    promptVersionId: string
    slots: Array<{ slot: 0 | 1 | 2; model: string }>
    temperature?: number
    maxTokens?: number
    variables?: Record<string, string>
  }) {
    store.resetSlots()
    params.slots.forEach(({ slot }) => store.setSlotStatus(slot, "streaming"))

    const res = await fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })

    if (!res.ok || !res.body) {
      params.slots.forEach(({ slot }) => store.setSlotError(slot, "Request failed"))
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    // Local accumulator avoids reading stale store snapshots mid-stream
    const outputAccum: Record<number, string> = { 0: "", 1: "", 2: "" }

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
          if (event.type === "chunk") {
            outputAccum[event.slot] = (outputAccum[event.slot] ?? "") + event.text
            store.setSlotOutput(event.slot, outputAccum[event.slot])
          } else if (event.type === "done") {
            store.setSlotStatus(event.slot, "done")
            store.setSlotStats(event.slot, {
              runId: event.runId,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              costUsd: event.costUsd,
              latencyMs: event.latencyMs,
            })
          } else if (event.type === "error") {
            store.setSlotStatus(event.slot, "error")
            store.setSlotError(event.slot, event.error)
          }
        } catch {
          // malformed line — skip
        }
      }
    }
  }

  return { runCompare, slots: store.slots }
}
