# Sprint 5: Experiments & Regression Testing

Teaching summary, written after security + QA sign-off. Read
`sprint-5-architect.md` first for the contract; this explains what was built,
why it looks the way it does, and where the implementation deliberately
deviates from the contract.

## The one idea that shapes everything

**An experiment cell IS a DatasetRun, and a regression run IS a DatasetRun.**
Sprint 4 built a queued, idempotent, lease-safe batch runner with progress
tracking and auto-scoring. Sprint 5 adds *zero* new execution machinery, it
adds two thin layers of meaning on top:

- An `Experiment` is a name for "these variant × model DatasetRuns belong
  together" (each cell carries `experimentId`).
- A `RegressionRun` is a name for "this DatasetRun should be compared to that
  pinned baseline DatasetRun when it finishes."

All the hard problems (fan-out, retries, dedup, partial failure, judge-eval
latency) were solved once in Sprint 4 and inherited for free. The only new
runtime code is *what happens when a run reaches a terminal state*.

## What each file does

### Backend: pure logic (no IO, directly unit-executed by QA)

- `lib/experiments/stats.ts`, mean, sample variance, and `buildWinMatrix`
  (pairwise difference of means per model, ordered by variant). Descriptive
  statistics only, pinned by the architect: with ≤ 500 non-IID rows and judge
  noise, p-values would be theater. Cells with < 10 scored rows
  (`MIN_SCORED_ROWS`) get an `insufficientSample` flag instead.
- `lib/regression/compare.ts`. `compareToBaseline`: rows matched by
  `rowIndex` (datasets are immutable, so the same index is the same input).
  A row regressed if its pass flipped true→false OR its score dropped by more
  than the threshold; the run regressed if `scoreDelta < -threshold`. Both
  comparisons carry a `1e-9` epsilon. QA caught that `0.75 - 0.8` is
  `-0.050000000000000044` in IEEE-754, which a strict `<` would wrongly flag
  at a 0.05 threshold.

### Backend: orchestration

- `lib/experiments/runner.ts`. `launchExperiment()`: create the Experiment,
  then launch each variant × model cell through the Sprint 4 fan-out with
  `experimentId` set. Cells share the per-user QStash flow-control key, so a
  12-cell experiment queues politely. The status bump to `running` is a
  guarded `updateMany(status: "pending")` so a fast cell that already
  completed the whole experiment can't be overwritten backwards.
- `lib/experiments/aggregate.ts`. `finalizeExperimentCell()`: when a cell
  goes terminal, copy its DatasetRun aggregates into an `ExperimentResult`
  (a materialized snapshot. Charts read results long after, decoupled from
  DatasetRun retention), then mark the Experiment complete if every cell is
  terminal. The `@@unique([experimentId, promptVersionId, model])` upsert is
  the idempotency seam: double-finalize writes the same numbers twice.
- `lib/regression/finalize.ts`. `finalizeRegressionIfPending()`: looks up a
  pending RegressionRun by `datasetRunId`, fetches per-row scores for both
  runs, calls the pure compare, fills in the verdict via a status-guarded
  `updateMany`. A run that finished unscoreable (all rows failed, rubric
  deleted mid-run) becomes `status: "failed"`, no fake delta.
- `lib/datasets/finalize.ts`, gained exactly the one hook the architect
  planned: after a DatasetRun is written terminal, call
  `finalizeExperimentCell` (if `experimentId`) and
  `finalizeRegressionIfPending`. Every terminal path already flowed through
  here (row job success/failure, judge eval completion/failure), so both
  features finalize correctly even when the *last* event is a slow judge eval.
- `lib/datasets/runner.ts`, refactored into `createDatasetRun` +
  `fanOutDatasetRun` (+ the original `launchDatasetRun` composing both).
  Reason: the regression route must persist the RegressionRun intent row
  *between* creating the run and fanning out jobs, otherwise the last row job
  could finalize before the intent exists and the verdict would never be
  written.
- `lib/datasets/rowsQuery.ts`, the per-row drill-down query extracted from
  the Sprint 4 rows route so the experiment rows proxy returns the identical
  shape. Rows now also carry `datasetRowId`, which is how the UI matches
  `regressedRowIds`.
- `lib/regression/baseline.ts`. `toBaselineDto()`: joins display names
  (version number, dataset/rubric names, the run's model) that the Baseline
  row only stores ids for.

### API routes

- `app/api/experiments/route.ts`, gET list (with cell progress counts),
  POST create + launch. Validation order: confirm gate → name → dataset
  ownership → rubric ownership (required. Comparison without scores is
  meaningless) → variants (1–4, no dupes, all owned, all same prompt) →
  models (1–3, no dupes, each available) → params (≤ 4096 maxTokens) →
  per-variant identity mapping against dataset columns. Foreign ids return
  400 "invalid X", never revealing whether the id exists.
- `app/api/experiments/[id]/route.ts`. Status + live cell roll-up (polled).
- `app/api/experiments/[id]/results/route.ts`, experimentResults + win
  matrix + per-criterion means (one query over all cell evaluations, grouped
  by criterion name from the stored `criteriaScores`).
- `app/api/experiments/[id]/rows/route.ts`, drill-down proxy:
  `?cell=<datasetRunId>` verified to belong to this experiment.
- `app/api/prompts/[id]/baseline/route.ts`, gET/POST/DELETE, a baseline
  is set by *pointing at an existing complete scored DatasetRun* of the
  version. Cheaper than re-running, and the user blesses numbers they have
  seen. One active baseline per prompt (`@@unique([promptId])`, upsert).
- `app/api/prompts/[id]/regression/route.ts`, pOST: launches the new
  version against the baseline's dataset + rubric + **model** (pinned:
  regression compares prompts, not models), threshold validated into
  [0.01, 0.5], default 0.05. Returns 202 with the DatasetRun poll handle.
- `app/api/prompts/[id]/regression/history/route.ts`. Baseline + runs
  newest-first. Pending rows whose DatasetRun already went terminal are
  lazily finalized here, so a lost hook can never wedge a verdict forever.

### Frontend

- `hooks/useExperiments.ts`, `hooks/useRegression.ts`, TanStack Query;
  self-terminating polls (experiment detail every 2s until `complete`,
  history every 3s while any run is `pending`); "no baseline" is modeled as
  `null` data, not an error.
- `components/experiments/`. `ExperimentConfig` (variant/model multi-pick
  with caps, estimate-then-confirm gate reusing the Sprint 4 estimate
  endpoint per model), `CellGrid` (live variants × models status),
  `WinMatrix`, `CriterionBreakdown`, `ResultDrilldown` (cell picker + the
  shared row table).
- `components/regression/`. `BaselineCard` (view/set/replace/delete),
  `RegressionTrigger` (version + threshold + progress bar),
  `RegressionResult` (history table; regressed rows expand inline by
  filtering the run's rows against `regressedRowIds`), `ScoreOverTimeChart`
  (Recharts line + baseline reference line).
- Pages: `/experiments`, `/experiments/new`, `/experiments/[id]`,
  `/prompts/[id]/regression`; nav link enabled; "Regression" link added to
  the prompt header.

## Deliberate deviations from the architect contract (and why)

1. **RegressionRun is created at launch** with `status: "pending"` and
   nullable result fields, not at completion as the contract's non-null
   schema implied. The finalize hook needs the *intent* (which baseline,
   which threshold) persisted somewhere; the threshold is request-scoped, so
   without this row the comparison would be impossible after the request
   ends. `datasetRunId` is unique on it, making finalization idempotent.
2. **ExperimentResult aggregates are nullable** (`avgScore?` etc.). A failed
   cell has no honest score; writing 0 would poison the win matrix. The
   contract's "failed cells visible, not hidden" pin wins over its non-null
   field sketch.
3. **Epsilon on threshold comparisons** (`1e-9`). See compare.ts above.
4. **History endpoint lazily finalizes** stale pending runs, self-healing
   beats a stuck "pending" badge.

## Patterns worth knowing

- **Materialized snapshot**: ExperimentResult copies DatasetRun aggregates at
  completion instead of joining live. Same reasoning as Sprint 3's rubric
  snapshot on Evaluation: results must stay interpretable even if upstream
  rows change or vanish.
- **Intent row + completion hook**: persist *what should happen on finish*
  (pending RegressionRun) before work starts, then let the existing
  completion path discover and execute it. This is how you bolt new semantics
  onto an existing async pipeline without forking it.
- **Guarded transitions everywhere**: every status write is either an upsert
  on a unique key or an `updateMany` with the expected current status in the
  WHERE clause, compare-and-swap at the SQL level. Racing finalizers are
  *expected* (QStash retries, lazy heal, judge evals) and harmless.
- **Identity over configuration**: experiments don't take a mapping object;
  `{{vars}}` must equal dataset column names. Less API surface, and the
  Sprint 4 mapping machinery still validates everything server-side.

## What you should be able to explain in an interview

- Why reusing the batch runner (cell = DatasetRun) is better than a second
  experiment runner (one idempotency story, one progress mechanism, one
  fan-out path, and Sprint 4's QA hardening applies automatically).
- Why per-row regression comparison requires pinning a `datasetRunId` on the
  baseline, not just a score (you need the baseline's *row-level* evals to
  know which rows flipped).
- Why no p-values: small n, rows are not IID samples from one distribution,
  and AI-judge scores add correlated noise. A t-test would imply rigor the
  data can't support. Descriptive deltas + a sample-size badge are honest.
- The float-boundary bug class (`0.75 - 0.8 !== -0.05`) and why money/score
  threshold comparisons need an epsilon or integer units.
- How the system stays correct when two workers finalize the same run
  concurrently (recompute-style finalize + CAS-guarded writes + unique-key
  upserts).

## To go deeper

- Welch's t-test and why unequal variances matter (the documented follow-up
  for the win matrix).
- Optimistic concurrency control vs row locks; Postgres partial/unique
  indexes as idempotency primitives.
- "Outbox pattern", the general form of the RegressionRun intent row.
- TanStack Query `refetchInterval` as a state machine (self-terminating
  polls) vs websockets/SSE for progress.
