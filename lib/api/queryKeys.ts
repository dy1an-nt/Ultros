// Every TanStack Query key in one place. Keys were previously written inline as
// string arrays at each call site, which made two things invisible: that five
// components share the `versions` key, and that some keys are deliberately
// prefixes of others.
//
// TanStack invalidates by prefix, so a key built by spreading another one is
// swept when that shorter key is invalidated. The spreads below are the
// mechanism, not a shorthand: `evals(promptId)` is what EvalTrigger
// invalidates, and `evalHistory(promptId, limit)` is what has to be swept.

export const queryKeys = {
  models: () => ["models"] as const,
  settings: () => ["settings"] as const,
  usage: (days: number) => ["usage", days] as const,
  shares: () => ["shares"] as const,

  prompts: () => ["prompts"] as const,
  prompt: (id: string) => ["prompt", id] as const,
  versions: (promptId: string) => ["versions", promptId] as const,
  runs: (promptId: string) => ["runs", promptId] as const,

  rubrics: () => ["rubrics"] as const,
  evaluation: (evalId: string | null) => ["eval", evalId] as const,
  evals: (promptId: string) => ["evals", promptId] as const,
  evalHistory: (promptId: string, limit: number) =>
    [...queryKeys.evals(promptId), limit] as const,
  leaderboard: (promptId: string) => ["leaderboard", promptId] as const,
  leaderboardFor: (promptId: string, rubricId?: string) =>
    [...queryKeys.leaderboard(promptId), rubricId ?? "all"] as const,

  datasets: () => ["datasets"] as const,
  dataset: (id: string, offset: number, limit: number) => ["dataset", id, offset, limit] as const,
  datasetRuns: (datasetId: string) => ["datasetRuns", datasetId] as const,
  datasetRun: (runId: string | null) => ["datasetRun", runId] as const,
  datasetRunRows: (runId: string | null, offset: number, limit: number) =>
    ["datasetRunRows", runId, offset, limit] as const,

  experiments: () => ["experiments"] as const,
  experiment: (id: string) => ["experiment", id] as const,
  experimentResults: (id: string) => ["experimentResults", id] as const,
  experimentCellRows: (
    experimentId: string,
    cellId: string | null,
    offset: number,
    limit: number
  ) => ["experimentCellRows", experimentId, cellId, offset, limit] as const,

  baseline: (promptId: string) => ["baseline", promptId] as const,
  regressionHistory: (promptId: string) => ["regressionHistory", promptId] as const,
}
