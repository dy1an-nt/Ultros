// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { WinMatrix } from "@/components/experiments/WinMatrix"
import type { ExperimentDetailDto, ExperimentResultsDto } from "@/types/experiment"
import type { WinMatrixEntry } from "@/lib/experiments/stats"

// The win matrix is where a reader decides which prompt version won, so the
// verdict column has to say the right thing in every case the statistics can
// produce: a clear lead either way, an exact tie, and a sample too small to
// read anything into.

const V1 = "ver-1"
const V2 = "ver-2"

const experiment = {
  id: "exp-1",
  name: "v1 vs v2, tone rewrite",
  datasetId: "ds-1",
  rubricId: "rb-1",
  variantVersionIds: [V1, V2],
  models: ["gpt-4o"],
  status: "complete",
  createdAt: "2026-06-27T22:27:07.397Z",
  completedAt: "2026-06-27T23:32:15.887Z",
  cells: [],
  datasetName: "Support tickets",
  rubricName: "Triage quality",
  versions: [
    { id: V1, versionNumber: 1, label: "baseline" },
    { id: V2, versionNumber: 2, label: null },
  ],
} satisfies ExperimentDetailDto

function resultsWith(...winMatrix: WinMatrixEntry[]): ExperimentResultsDto {
  return { results: [], criteria: [], winMatrix } as unknown as ExperimentResultsDto
}

const entry = (over: Partial<WinMatrixEntry> = {}): WinMatrixEntry =>
  ({ a: V1, b: V2, model: "gpt-4o", meanDiff: 0, insufficientSample: false, ...over }) as WinMatrixEntry

function verdictCell() {
  const row = screen.getAllByRole("row")[1]
  return within(row).getAllByRole("cell")
}

describe("WinMatrix", () => {
  it("explains what is missing when there are no comparable pairs", () => {
    render(<WinMatrix experiment={experiment} results={resultsWith()} />)

    expect(screen.getByText(/needs at least two scored cells on one model/i)).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("names the leading variant when A scores higher", () => {
    render(<WinMatrix experiment={experiment} results={resultsWith(entry({ meanDiff: 0.101 }))} />)

    const cells = verdictCell()
    expect(cells[3].textContent).toBe("+0.101")
    expect(cells[4].textContent).toBe("v1: baseline leads")
  })

  it("names the leading variant when B scores higher, and keeps the sign", () => {
    render(<WinMatrix experiment={experiment} results={resultsWith(entry({ meanDiff: -0.25 }))} />)

    const cells = verdictCell()
    expect(cells[3].textContent).toBe("-0.250")
    expect(cells[4].textContent).toBe("v2 leads")
  })

  it("calls an exact zero a tie rather than a win", () => {
    render(<WinMatrix experiment={experiment} results={resultsWith(entry({ meanDiff: 0 }))} />)

    expect(verdictCell()[4].textContent).toBe("tie")
  })

  it("withholds a verdict when the sample is too small, even with a real difference", () => {
    // The difference is large, but under ten scored rows it should not be
    // presented as a result.
    render(
      <WinMatrix
        experiment={experiment}
        results={resultsWith(entry({ meanDiff: 0.4, insufficientSample: true }))}
      />
    )

    const cells = verdictCell()
    expect(cells[4].textContent).toBe("insufficient sample")
    expect(cells[4].textContent).not.toMatch(/leads/)
  })

  it("rounds the difference to three decimals", () => {
    render(<WinMatrix experiment={experiment} results={resultsWith(entry({ meanDiff: 0.12345 }))} />)

    expect(verdictCell()[3].textContent).toBe("+0.123")
  })

  it("falls back to a truncated id when a version is not in the experiment", () => {
    const orphan = "ver-missing-entirely"
    render(<WinMatrix experiment={experiment} results={resultsWith(entry({ a: orphan, meanDiff: 0.2 }))} />)

    expect(verdictCell()[1].textContent).toBe(orphan.slice(0, 8))
  })

  it("renders one row per pair and labels each with its model", () => {
    render(
      <WinMatrix
        experiment={experiment}
        results={resultsWith(
          entry({ model: "gpt-4o", meanDiff: 0.1 }),
          entry({ model: "claude-sonnet-4-6", meanDiff: -0.1 })
        )}
      />
    )

    const rows = screen.getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getAllByRole("cell")[0].textContent).toBe("gpt-4o")
    expect(within(rows[1]).getAllByRole("cell")[0].textContent).toBe("claude-sonnet-4-6")
  })
})
