// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useCompareRun } from "@/hooks/useCompareRun"
import { useCompareStore } from "@/store/compareStore"

// The compare endpoint answers with newline-delimited JSON, one event per
// line, tagged with the slot it belongs to. These tests drive the reader
// directly so the parsing rules are pinned without a server: chunk assembly
// across arbitrary read boundaries, tolerance of junk lines, and the cleanup
// that keeps a slot from sitting in "streaming" forever.

function streamOf(...pieces: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

const line = (event: Record<string, unknown>) => JSON.stringify(event) + "\n"

const baseParams = {
  promptVersionId: "pv-1",
  slots: [
    { slot: 0 as const, model: "claude-sonnet-4-6" },
    { slot: 1 as const, model: "gpt-4o" },
  ],
}

function slots() {
  return useCompareStore.getState().slots
}

beforeEach(() => {
  useCompareStore.getState().resetSlots()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useCompareRun", () => {
  it("routes chunks to their own slot and leaves the others untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamOf(
          line({ type: "chunk", slot: 0, text: "Hello" }),
          line({ type: "chunk", slot: 1, text: "Bonjour" }),
          line({ type: "chunk", slot: 0, text: " world" })
        )
      )
    )

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].output).toBe("Hello world")
    expect(slots()[1].output).toBe("Bonjour")
    expect(slots()[2].output).toBe("")
  })

  it("reassembles an event split across two reads", async () => {
    // The network decides where reads break, so a JSON object routinely
    // arrives in halves. The buffer must hold the partial line.
    const whole = line({ type: "chunk", slot: 0, text: "split across reads" })
    const cut = Math.floor(whole.length / 2)

    vi.stubGlobal("fetch", vi.fn(async () => streamOf(whole.slice(0, cut), whole.slice(cut))))

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].output).toBe("split across reads")
  })

  it("skips malformed lines and keeps processing the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamOf(
          "{ not json at all\n",
          "\n",
          line({ type: "chunk", slot: 0, text: "survived" }),
          line({ type: "done", slot: 0, runId: "run-1", inputTokens: 10, outputTokens: 20, costUsd: 0.001, latencyMs: 900 })
        )
      )
    )

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].output).toBe("survived")
    expect(slots()[0].status).toBe("done")
  })

  it("ignores events whose slot is out of range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamOf(
          line({ type: "chunk", slot: 7, text: "nowhere" }),
          line({ type: "chunk", slot: "0", text: "string slot" }),
          line({ type: "chunk", slot: 0, text: "kept" })
        )
      )
    )

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].output).toBe("kept")
  })

  it("records per-slot stats from the done event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamOf(
          line({
            type: "done",
            slot: 1,
            runId: "run-42",
            inputTokens: 120,
            outputTokens: 340,
            costUsd: 0.0123,
            latencyMs: 1875,
          })
        )
      )
    )

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[1].status).toBe("done")
    expect(slots()[1].stats).toMatchObject({
      runId: "run-42",
      inputTokens: 120,
      outputTokens: 340,
      costUsd: 0.0123,
      latencyMs: 1875,
    })
  })

  it("marks only the failing slot when one model errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamOf(
          line({ type: "error", slot: 0, error: "provider refused" }),
          line({ type: "done", slot: 1, runId: "run-2", inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 10 })
        )
      )
    )

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].status).toBe("error")
    expect(slots()[0].error).toBe("provider refused")
    expect(slots()[1].status).toBe("done")
  })

  it("fails a slot the server never resolved, instead of leaving it streaming", async () => {
    // A slot stuck in "streaming" keeps the Run button disabled forever, so
    // the finally block has to close it out.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamOf(line({ type: "done", slot: 0, runId: "run-3", inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 5 }))
      )
    )

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].status).toBe("done")
    expect(slots()[1].status).toBe("error")
    expect(slots()[1].error).toBe("Stream ended unexpectedly")
  })

  it("surfaces the message from the API error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { data: null, error: { code: "RATE_LIMITED", message: "Rate limit exceeded, slow down and retry shortly" } },
          { status: 429 }
        )
      )
    )

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    for (const slot of [0, 1]) {
      expect(slots()[slot].status).toBe("error")
      expect(slots()[slot].error).toBe("Rate limit exceeded, slow down and retry shortly")
    }
  })

  it("falls back to a generic message when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })))

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].error).toBe("Request failed")
  })

  it("closes out every slot when the connection drops mid-stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network error") }))

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    for (const slot of [0, 1]) {
      expect(slots()[slot].status).toBe("error")
      expect(slots()[slot].error).toBe("Stream ended unexpectedly")
    }
  })

  it("clears previous output before a re-run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamOf(line({ type: "chunk", slot: 0, text: "first" }))))

    const { result } = renderHook(() => useCompareRun())
    await act(async () => {
      await result.current.runCompare(baseParams)
    })
    expect(slots()[0].output).toBe("first")

    vi.stubGlobal("fetch", vi.fn(async () => streamOf(line({ type: "chunk", slot: 0, text: "second" }))))
    await act(async () => {
      await result.current.runCompare(baseParams)
    })

    expect(slots()[0].output).toBe("second")
  })
})
