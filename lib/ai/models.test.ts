import { describe, expect, it } from "vitest"
import {
  MODEL_CATALOG,
  THINKING_TOKEN_HEADROOM,
  getModelInfo,
  outputTokenBudget,
  supportsSampling,
} from "./models"

// Verified against GET /v1/models and a live request per model on 2026-09-04:
// each of these rejects `temperature` with a 400.
const SAMPLING_REJECTED = ["claude-opus-4-7", "claude-opus-5", "claude-sonnet-5", "claude-fable-5-1"]

describe("model catalog", () => {
  it("has no duplicate ids", () => {
    const ids = MODEL_CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("prices every model, local inference included", () => {
    for (const m of MODEL_CATALOG) {
      expect(m.inputPerMillion, m.id).toBeGreaterThanOrEqual(0)
      expect(m.outputPerMillion, m.id).toBeGreaterThanOrEqual(0)
      expect(m.contextWindow, m.id).toBeGreaterThan(0)
    }
  })
})

describe("supportsSampling", () => {
  it("is false for the models that removed temperature", () => {
    for (const id of SAMPLING_REJECTED) {
      expect(getModelInfo(id), `${id} missing from the catalog`).toBeDefined()
      expect(supportsSampling(id), id).toBe(false)
    }
  })

  it("stays true for models that still accept a temperature", () => {
    expect(supportsSampling("claude-haiku-4-5")).toBe(true)
    expect(supportsSampling("claude-sonnet-4-6")).toBe(true)
    expect(supportsSampling("gpt-4o")).toBe(true)
  })

  it("assumes support for an id the catalog does not know", () => {
    expect(supportsSampling("some/unlisted-model")).toBe(true)
  })
})

describe("outputTokenBudget", () => {
  it("leaves the requested ceiling alone for models that do not think", () => {
    expect(outputTokenBudget("claude-haiku-4-5", 1024)).toBe(1024)
    expect(outputTokenBudget("gpt-4o", 4096)).toBe(4096)
  })

  it("adds headroom so thinking does not eat the answer", () => {
    expect(outputTokenBudget("claude-opus-5", 1024)).toBe(1024 + THINKING_TOKEN_HEADROOM)
    expect(outputTokenBudget("claude-fable-5-1", 512)).toBe(512 + THINKING_TOKEN_HEADROOM)
  })

  it("passes an unknown id through untouched", () => {
    expect(outputTokenBudget("some/unlisted-model", 2048)).toBe(2048)
  })
})
