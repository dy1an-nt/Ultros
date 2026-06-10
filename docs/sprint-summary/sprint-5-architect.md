# Sprint 5 — Experiments & Regression Testing — Architect Plan

Status: Contract draft, architect-reviewed 2026-06-09. Builds directly on the
Sprint 4 `DatasetRun` machinery — read `sprint-4-architect.md` first. Where
this document deviates from the CLAUDE.md baseline, this document wins.

## Architect changes vs the CLAUDE.md baseline (read first)

1. **An experiment cell IS a DatasetRun.** An Experiment is variants × models;
   each cell launches one DatasetRun with `experimentId` set (column already
   exists from Sprint 4). No second batch runner, no second progress
   mechanism, no second idempotency story. `ExperimentResult` stays as the
   baseline defines it, but it is a materialized copy of its cell's
   DatasetRun aggregates (plus `datasetRunId` for drill-down) written at cell
   completion — kept because Sprint 5 charts and the win matrix read results
   long after, and copying decouples them from DatasetRun retention.
2. **Baselines pin a DatasetRun, not just a score.** The baseline stores
   `datasetRunId` of the run that produced `baselineScore`, enabling
   **per-row** regression comparison (which rows got worse), not only an
   aggregate delta. CLAUDE.md's `regressedRowIds` is impossible without this.
3. **Statistics are descriptive only — pinned.** Mean, sample variance, pass
   rate, latency, cost per cell; win matrix = pairwise difference of means.
   No p-values in v1: n ≤ 500 non-IID rows with judge noise would make them
   theater. The UI shows an "insufficient sample" badge when a cell has
   < 10 scored rows. (Welch's t-test is a documented follow-up, not scope.)
4. **One active baseline per prompt** (`@@unique([promptId])`) — re-POST
   replaces it. Matches the `POST /api/prompts/:id/baseline` shape; multiple
   named baselines are out of scope.
5. **Regression thresholds pinned.** Run-level: `regressed = scoreDelta <
   -0.05` (request-overridable `threshold` in [0.01, 0.5]). Row-level: a row
   is regressed if its pass flipped true→false OR its score dropped by more
   than the run threshold. Rows are matched baseline↔new by `rowIndex`
   (datasets are immutable — Sprint 4 decision pays off here).
6. **Cell caps + cost confirmation.** ≤ 4 variants × ≤ 3 models (≤ 12 cells).
   Estimate = Sprint 4 estimate × cells; launch requires `confirm: true`.
   Rubric is **required** for experiments and regressions (comparison without
   scores is meaningless).
7. **Experiment completes with failed cells visible** — status `complete`
   when every cell reaches a terminal state; per-cell `failed` is shown, not
   hidden behind an all-or-nothing experiment failure.

## Requirements

Done when: configure variants × dataset × models × rubric, launch, watch
cells complete, read a win matrix + per-criterion breakdown + per-row
drill-down; AND pin a baseline, run a new version against it, see the delta,
the regressed flag, and exactly which rows regressed; score-over-time chart
renders from regression history.

## DB changes (prisma/schema.prisma + migration)

```prisma
model Experiment {
  id                String             @id @default(cuid())
  userId            String
  user              User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  name              String
  datasetId         String             // Restrict via DatasetRun; plain column here
  rubricId          String
  variantVersionIds String[]
  models            String[]
  status            String             // "pending" | "running" | "complete"
  createdAt         DateTime           @default(now())
  completedAt       DateTime?
  results           ExperimentResult[]

  @@index([userId])
}

model ExperimentResult {
  id              String     @id @default(cuid())
  experimentId    String
  experiment      Experiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  promptVersionId String
  model           String
  datasetRunId    String     // drill-down handle to the cell's DatasetRun
  avgScore        Float
  scoreVariance   Float
  avgLatencyMs    Int
  totalCostUsd    Float
  passRate        Float
  scoredRows      Int        // basis for the insufficient-sample badge
  cellStatus      String     // "complete" | "failed"
  createdAt       DateTime   @default(now())

  @@unique([experimentId, promptVersionId, model])
  @@index([experimentId])
}

model Baseline {
  id               String   @id @default(cuid())
  userId           String
  promptId         String   @unique // one active baseline per prompt
  promptVersionId  String
  datasetId        String
  rubricId         String
  datasetRunId     String   // the run that produced the numbers below
  baselineScore    Float
  baselinePassRate Float
  setAt            DateTime @default(now())
  regressionRuns   RegressionRun[]

  @@index([userId])
}

model RegressionRun {
  id              String   @id @default(cuid())
  baselineId      String
  baseline        Baseline @relation(fields: [baselineId], references: [id], onDelete: Cascade)
  userId          String
  newVersionId    String
  datasetRunId    String   // the new run
  newScore        Float
  newPassRate     Float
  scoreDelta      Float    // newScore - baselineScore
  threshold       Float    // what "regressed" meant for this run
  regressed       Boolean
  regressedRowIds String[] // DatasetRow ids
  createdAt       DateTime @default(now())

  @@index([baselineId])
  @@index([userId])
}
```

No DatasetRun changes — `experimentId` was added in Sprint 4.

## New files / services

```
lib/experiments/runner.ts     # launchExperiment(): create + fan out cells (DatasetRuns)
lib/experiments/aggregate.ts  # cell completion → ExperimentResult; experiment roll-up
lib/experiments/stats.ts      # mean/variance/passRate/winMatrix (pure, unit-testable)
lib/regression/compare.ts     # per-row + aggregate diff vs baseline (pure)
app/api/experiments/route.ts            # GET list, POST create+launch (confirm)
app/api/experiments/[id]/route.ts       # GET status + results roll-up
app/api/experiments/[id]/results/route.ts # GET per-cell breakdown + win matrix
app/api/experiments/[id]/rows/route.ts  # GET per-row drill-down (proxies cell DatasetRun rows)
app/api/prompts/[id]/baseline/route.ts  # POST set/replace, GET current, DELETE
app/api/prompts/[id]/regression/route.ts        # POST run vs baseline (202)
app/api/prompts/[id]/regression/history/route.ts # GET score-over-time
components/experiments/ ExperimentConfig, CellGrid (live status), WinMatrix,
                        CriterionBreakdown, ResultDrilldown
components/regression/ BaselineCard, RegressionTrigger, RegressionResult
                       (regressed rows table), ScoreOverTimeChart (Recharts)
hooks/useExperiments.ts, useExperiment.ts (poll), useBaseline.ts,
hooks/useRegression.ts, useRegressionHistory.ts
app/(dashboard)/experiments/page.tsx, experiments/new/page.tsx,
app/(dashboard)/experiments/[id]/page.tsx,
app/(dashboard)/prompts/[id]/regression/page.tsx
```

No new deps.

## Flows

Experiment launch (`POST /api/experiments`):
1. Auth; ownership of dataset, rubric, every variant version (all must belong
   to the same prompt — 400 otherwise); models pass `isModelAvailable`;
   caps (≤4 × ≤3); `confirm: true` with estimate echo.
2. Create Experiment `pending` + one DatasetRun per cell (status `pending`,
   `experimentId` set), then launch cells **sequentially through the Sprint 4
   fan-out** (cells share the per-user QStash flow-control key, so a 12-cell
   experiment queues politely).
3. `finalizeIfDone` (Sprint 4) gains one hook: when a DatasetRun with an
   `experimentId` reaches a terminal state, write its ExperimentResult and, if
   it was the last cell, mark the Experiment `complete` + `completedAt`.
   Idempotent via the `@@unique([experimentId, promptVersionId, model])`
   upsert.

Regression (`POST /api/prompts/:id/regression`):
1. Auth + baseline must exist (404 with actionable message otherwise);
   body `{ newVersionId, threshold? }` — version must belong to the prompt.
2. Launch a DatasetRun for (newVersion × baseline's dataset/rubric/model —
   **the baseline run's model is reused**, pinned: regression compares
   prompts, not models).
3. On completion: `lib/regression/compare.ts` matches rows by `rowIndex`,
   computes deltas, writes RegressionRun. Returns 202 + poll handle
   (`GET /api/dataset-runs/:id` for progress; the RegressionRun row appears
   when finalized, surfaced via the history endpoint).

`POST /api/prompts/:id/baseline` body
`{ promptVersionId, datasetRunId }` — pinned: a baseline is set by **pointing
at an existing complete DatasetRun** of that version (with rubric), not by
launching a fresh run. Cheaper, and the user blesses numbers they have seen.
400 if the run isn't complete, isn't theirs, has no rubric, or doesn't match
the version.

## API contract (request/response examples)

`POST /api/experiments`
```json
req:  { "name": "tone v2 vs v3", "datasetId": "ds_1", "rubricId": "rub_x",
        "variantVersionIds": ["v_2", "v_3"],
        "models": ["claude-haiku-4-5", "gpt-5.2"], "temperature": 0.7,
        "maxTokens": 1024, "confirm": true }
res 202: { "data": { "id": "exp_1", "status": "pending", "cells": [
          { "promptVersionId": "v_2", "model": "claude-haiku-4-5",
            "datasetRunId": "drun_9", "status": "pending" }, ... ] }, "error": null }
```

`GET /api/experiments/:id/results`
```json
res: { "data": { "results": [ { "promptVersionId": "v_2", "model": "...",
       "avgScore": 0.81, "scoreVariance": 0.02, "passRate": 0.9,
       "avgLatencyMs": 740, "totalCostUsd": 0.38, "scoredRows": 120,
       "cellStatus": "complete" } ],
       "winMatrix": [ { "a": "v_2", "b": "v_3", "model": "...",
         "meanDiff": 0.07, "insufficientSample": false } ] }, "error": null }
```

`POST /api/prompts/:id/regression`
```json
req:  { "newVersionId": "v_4", "threshold": 0.05 }
res 202: { "data": { "datasetRunId": "drun_12", "baselineScore": 0.84 }, "error": null }
```

`GET /api/prompts/:id/regression/history` → RegressionRuns newest-first,
each `{ newVersionId, versionNumber, newScore, scoreDelta, regressed,
regressedRowIds, createdAt }` — feeds ScoreOverTimeChart directly.

## Risks / security notes

- Cost multiplies by cell count — the confirm gate shows
  `cells × per-cell estimate`; cap at 12 cells.
- Cross-prompt version smuggling: every `variantVersionId` and
  `newVersionId` must be verified to belong to the named prompt AND the
  authed user (the version table has no userId — join through Prompt).
- ExperimentResult upsert is the idempotency seam for double-finalize.
- Baselines referencing a DatasetRun create a retention dependency —
  dataset delete is already blocked by Restrict (Sprint 4); add the same 409
  if a dataset's run is referenced by a Baseline.
- Stats code is pure and unit-tested (QA executes `stats.ts` and
  `compare.ts` directly, like Sprint 3's matchers).
- `.bin` shims broken on this volume — `node node_modules/...` invocations.

## Success criteria

1. 2×2 experiment over a 100-row dataset completes; win matrix and
   per-criterion stats match hand-computed values; failed cell renders as
   failed without hiding the other cells.
2. Set baseline from an existing complete DatasetRun → regression run on a
   worse version flags `regressed: true` with the exact rows that flipped or
   dropped; a better version yields `regressed: false`, positive delta.
3. Editing/deleting the rubric after the baseline is set changes nothing
   (snapshots); deleting the dataset is blocked.
4. History endpoint drives the score-over-time chart with ≥ 3 points.
5. Foreign dataset/rubric/version anywhere → 400/403; caps and confirm
   enforced.
6. `tsc --noEmit` clean; `next build` passes; no console.log.
