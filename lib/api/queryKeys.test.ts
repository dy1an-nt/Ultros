import { describe, expect, it } from "vitest"
import { queryKeys } from "./queryKeys"

describe("queryKeys", () => {
  it("builds stable keys for singleton and prompt resources", () => {
    expect(queryKeys.models()).toEqual(["models"])
    expect(queryKeys.settings()).toEqual(["settings"])
    expect(queryKeys.usage(30)).toEqual(["usage", 30])
    expect(queryKeys.shares()).toEqual(["shares"])
    expect(queryKeys.prompts()).toEqual(["prompts"])
    expect(queryKeys.prompt("p1")).toEqual(["prompt", "p1"])
    expect(queryKeys.versions("p1")).toEqual(["versions", "p1"])
    expect(queryKeys.runs("p1")).toEqual(["runs", "p1"])
    expect(queryKeys.rubrics()).toEqual(["rubrics"])
    expect(queryKeys.evaluation("e1")).toEqual(["eval", "e1"])
    expect(queryKeys.evaluation(null)).toEqual(["eval", null])
    expect(queryKeys.baseline("p1")).toEqual(["baseline", "p1"])
    expect(queryKeys.regressionHistory("p1")).toEqual(["regressionHistory", "p1"])
  })

  it("keeps invalidation prefixes aligned with their parameterized keys", () => {
    expect(queryKeys.evals("p1")).toEqual(["evals", "p1"])
    expect(queryKeys.evalHistory("p1", 50)).toEqual(["evals", "p1", 50])
    expect(queryKeys.leaderboard("p1")).toEqual(["leaderboard", "p1"])
    expect(queryKeys.leaderboardFor("p1")).toEqual(["leaderboard", "p1", "all"])
    expect(queryKeys.leaderboardFor("p1", "r1")).toEqual(["leaderboard", "p1", "r1"])
  })

  it("includes every dataset and experiment discriminator", () => {
    expect(queryKeys.datasets()).toEqual(["datasets"])
    expect(queryKeys.dataset("d1", 20, 10)).toEqual(["dataset", "d1", 20, 10])
    expect(queryKeys.datasetRuns("d1")).toEqual(["datasetRuns", "d1"])
    expect(queryKeys.datasetRun("run1")).toEqual(["datasetRun", "run1"])
    expect(queryKeys.datasetRunRows("run1", 20, 10)).toEqual([
      "datasetRunRows",
      "run1",
      20,
      10,
    ])
    expect(queryKeys.experiments()).toEqual(["experiments"])
    expect(queryKeys.experiment("x1")).toEqual(["experiment", "x1"])
    expect(queryKeys.experimentResults("x1")).toEqual(["experimentResults", "x1"])
    expect(queryKeys.experimentCellRows("x1", "run1", 20, 10)).toEqual([
      "experimentCellRows",
      "x1",
      "run1",
      20,
      10,
    ])
  })
})
