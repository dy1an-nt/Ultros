// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RunControls } from "@/components/editor/RunControls"

// Newer Claude models reject `temperature` outright, and the run path drops it
// for them. The control has to agree with that: a slider the user can still
// drag would promise a setting the request never carries.

const models = [
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    provider: "anthropic" as const,
    category: "direct" as const,
    contextWindow: 200000,
    inputPerMillion: 1,
    outputPerMillion: 5,
    supportsSampling: true,
    thinksByDefault: false,
  },
  {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    provider: "anthropic" as const,
    category: "direct" as const,
    contextWindow: 1000000,
    inputPerMillion: 5,
    outputPerMillion: 25,
    supportsSampling: false,
    thinksByDefault: true,
  },
]

function renderControls() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const onRun = vi.fn().mockResolvedValue(undefined)
  render(
    <QueryClientProvider client={queryClient}>
      <RunControls onRun={onRun} onSaveVersion={vi.fn().mockResolvedValue(undefined)} />
    </QueryClientProvider>
  )
  return { onRun, user: userEvent.setup() }
}

const temperatureSlider = () => document.querySelector("input[type=range]") as HTMLInputElement

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: models, error: null }, { status: 200 }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("RunControls temperature", () => {
  it("offers a temperature for a model that accepts one", async () => {
    renderControls()
    await screen.findByRole("option", { name: "Claude Haiku 4.5" })

    await waitFor(() => expect(temperatureSlider().disabled).toBe(false))
    expect(screen.getByText(/^Temp: 1\.0$/)).toBeDefined()
  })

  it("disables the temperature once a model that rejects it is selected", async () => {
    const { user } = renderControls()
    await screen.findByRole("option", { name: "Claude Opus 5" })

    await user.selectOptions(screen.getByRole("combobox"), "claude-opus-5")

    await waitFor(() => expect(temperatureSlider().disabled).toBe(true))
    expect(screen.getByText("Temp: n/a")).toBeDefined()
  })

  it("runs the selected model that rejects sampling", async () => {
    const { onRun, user } = renderControls()
    await screen.findByRole("option", { name: "Claude Opus 5" })

    await user.selectOptions(screen.getByRole("combobox"), "claude-opus-5")
    await user.click(screen.getByRole("button", { name: /Run/ }))

    await waitFor(() => expect(onRun).toHaveBeenCalled())
    expect(onRun.mock.calls[0][0]).toBe("claude-opus-5")
  })
})
