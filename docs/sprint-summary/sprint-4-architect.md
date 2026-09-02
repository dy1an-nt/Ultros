# Sprint 4: Dataset Testing: Architect Plan

Status: Contract draft, architect-reviewed 2026-06-09. Backend and Frontend
build to this document; neither inspects the other's code to understand the
API. Where this document deviates from the CLAUDE.md baseline, this document
wins.

## Architect changes vs the CLAUDE.md baseline (read first)

1. **New `DatasetRun` model.** The baseline schema has no batch entity, no
   way to track a queued batch's status, progress, or aggregates. `DatasetRun`
   is one prompt version × one model × one dataset (× optional rubric).
   Sprint 5 reuses it wholesale: an experiment cell IS a DatasetRun, and a
   regression run IS a DatasetRun. Design it once here.
2. **Datasets are immutable after creation.** No row editing, no append,
   delete and re-upload instead. Sprint 5 baselines pin a datasetId; mutable
   rows would silently change what a baseline means (same reasoning as the
   Sprint 3 rubric snapshot). Deleting a dataset that has DatasetRuns is
   blocked (409). History stays interpretable.
3. **Lease-based job claim (fixes Sprint 3 QA observation O3).** The Sprint 3
   claim transition lets two concurrent deliveries both run a judge call.
   Fine for single manual evals; not fine for 500-row fan-out. New rule, also
   retrofitted to `runEvalJob`: a `running` row may only be re-claimed if
   `updatedAt` is older than 5 minutes (stale lease), via one `updateMany`
   compare-and-swap.
4. **Cost estimate + explicit confirmation before launch.** A 500-row run
   against an expensive model is a wallet-drain misclick. `POST
   .../run-estimate` returns `estimatedCostUsd`; the launch endpoint requires
   `confirm: true` and re-checks the row count it estimated against.
5. **Auto-scoring lands here.** If a DatasetRun has a `rubricId`, every row
   run is evaluated automatically, deterministic criteria inline in the row
   job, ai_judge via the existing Sprint 3 eval job. This fulfills the
   platform positioning ("every run auto-scored"); Sprint 3's manual trigger
   stays for ad-hoc runs.
6. **Pinned from Sprint 3 QA:** `contains`/`exact` default to
   **case-sensitive** when `caseSensitive` is omitted (D1), document in
   `types/eval.ts`, do not change behavior (history is already written and the
   UI always sends the flag). Fix the prompt page `runsQuery` to check
   `res.ok` so HTTP errors hit the error state, not the empty state (O1).
7. **Non-streaming generation path.** `lib/ai` only exports `runStream`.
   Batch jobs need `generateText` (`lib/ai/generate.ts`), same provider
   routing, same cost calc, no stream.
8. **QStash signature verification extracted** to `lib/jobs/verifySignature.ts`
   and shared by `/api/jobs/eval` and the new `/api/jobs/dataset-row`
   (same fail-closed 503 / 401 semantics as Sprint 3).

## Requirements

Done when: upload a CSV/JSON dataset, map `{{variables}}` to columns, run a
prompt version across all rows on one model with live progress, see aggregate
metrics (avg score, pass rate, variance, latency, cost) and per-row
drill-down, export results as CSV.

Upload limits (server-enforced, 400 on violation): payload ≤ 2 MB,
1–500 rows, 1–20 columns, column names 1–50 chars matching
`/^[a-zA-Z0-9_ -]+$/`, every cell coerced to string, `expectedOutput` is a
reserved optional column name (stored on `DatasetRow.expectedOutput`, not in
`data`). Duplicate column names → 400.

Variable mapping: every `{{var}}` in the version's system + user prompt must
map to a dataset column (explicit mapping object; identity mapping
pre-filled by the UI). Unmapped variable → 400 listing the missing names.
Extra columns are fine.

## DB changes (prisma/schema.prisma + migration)

```prisma
model Dataset {
  id          String       @id @default(cuid())
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  description String?
  columns     String[]
  rowCount    Int
  createdAt   DateTime     @default(now())
  rows        DatasetRow[]
  runs        DatasetRun[]

  @@index([userId])
}

model DatasetRow {
  id             String      @id @default(cuid())
  datasetId      String
  dataset        Dataset     @relation(fields: [datasetId], references: [id], onDelete: Cascade)
  rowIndex       Int
  data           Json        // column → string value
  expectedOutput String?
  runs           PromptRun[]

  @@unique([datasetId, rowIndex])
  @@index([datasetId])
}

model DatasetRun {
  id              String    @id @default(cuid())
  userId          String    // denormalized for isolation queries
  datasetId       String
  dataset         Dataset   @relation(fields: [datasetId], references: [id], onDelete: Restrict)
  promptVersionId String
  rubricId        String?   // snapshot lives on each Evaluation; id kept for filtering
  model           String
  temperature     Float
  maxTokens       Int
  variableMapping Json      // { templateVar: columnName }
  status          String    // "pending" | "running" | "complete" | "failed"
  totalRows       Int
  completedRows   Int       @default(0)
  failedRows      Int       @default(0)
  avgScore        Float?    // null until complete or when no rubric
  scoreVariance   Float?    // sample variance
  passRate        Float?
  avgLatencyMs    Int?
  totalCostUsd    Float     @default(0) // model + judge cost
  error           String?
  experimentId    String?   // wired in Sprint 5; nullable column added now
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  completedAt     DateTime?

  @@index([userId])
  @@index([datasetId])
}
```

`PromptRun` gains `datasetRowId String?` (relation, `onDelete: Cascade`,
rows only die with their dataset, which is blocked while runs exist) and
`datasetRunId String?` (+ index). `Evaluation` is unchanged, auto-eval rows
are ordinary Evaluations whose PromptRun carries the dataset linkage.

## New files / services

```
lib/datasets/parse.ts        # CSV (papaparse) + JSON array → { columns, rows }; all limits
lib/datasets/estimate.ts     # rough token estimate per row → estimatedCostUsd via lib/ai/pricing
lib/datasets/runner.ts       # launchDatasetRun(): create run, fan out row jobs; finalizeIfDone()
lib/datasets/rowJob.ts       # runDatasetRowJob(): lease-claim row, generate, persist, auto-eval
lib/ai/generate.ts           # non-streaming generateText wrapper (router + pricing reuse)
lib/jobs/verifySignature.ts  # shared QStash Receiver verification (fail-closed)
app/api/datasets/route.ts                  # GET list, POST create (parse + insert rows)
app/api/datasets/[id]/route.ts             # GET (+rows paginated), DELETE (409 if runs exist)
app/api/datasets/[id]/run-estimate/route.ts # POST cost estimate
app/api/datasets/[id]/run/route.ts         # POST launch (requires confirm: true)
app/api/dataset-runs/[id]/route.ts         # GET status + aggregates (poll)
app/api/dataset-runs/[id]/rows/route.ts    # GET per-row drill-down (paginated)
app/api/dataset-runs/[id]/export/route.ts  # GET CSV export
app/api/jobs/dataset-row/route.ts          # QStash worker (signature-verified)
components/datasets/ DatasetUpload, DatasetTable, ColumnMapper,
                     RunConfigDialog (estimate + confirm), RunProgress,
                     RunResults, RowDrilldown
hooks/useDatasets.ts, useDatasetRun.ts (poll), useDatasetRunRows.ts
app/(dashboard)/datasets/page.tsx, app/(dashboard)/datasets/[id]/page.tsx
```

New deps: `papaparse`, `@types/papaparse`.

## Batch flow

Launch (`POST /api/datasets/:id/run`):
1. Auth → ownership of dataset, prompt version (via its prompt), rubric.
2. Validate model (`isModelAvailable`), params, variable mapping against the
   version's `{{vars}}` and the dataset columns; `confirm: true` required.
3. Create DatasetRun `pending` with `totalRows = rowCount`.
4. Fan out one job per row. Production: QStash `publishJSON` per row with
   `deduplicationId: "${datasetRunId}:${rowIndex}"` and flow control
   (`flowControl: { key: userId, parallelism: 5 }`) so one user's batch can't
   starve the platform or hammer one provider. Dev: `after()` loop running
   rows sequentially (rowJob is identical in both paths).
5. Return 202 with the DatasetRun.

Row job (`runDatasetRowJob(datasetRunId, rowIndex)`):
1. Lease-claim: create-or-reclaim the row's PromptRun marker atomically,
   implemented as `updateMany` on DatasetRun only for status bump to
   `running`, plus a per-row idempotency check: if a PromptRun with
   `(datasetRunId, datasetRowId)` already exists, exit (QStash dedup is
   best-effort; the DB check is the guarantee).
2. Interpolate variables from `row.data` via `variableMapping`, call
   `generate()` (non-streaming), persist PromptRun (tokens, latency, cost,
   `datasetRowId`, `datasetRunId`). Roll into UsageSummary (runs + tokens +
   cost. These ARE user-initiated runs, unlike judge calls).
3. If `rubricId`: create Evaluation with snapshot exactly as Sprint 3's
   trigger route does (deterministic inline; if ai_judge criteria exist,
   chain `runEvalJob` inline in this job, already in a worker, no second hop).
4. On row failure: increment `failedRows`, store sanitized error on the
   PromptRun-less row result (a failed row = no PromptRun; the drill-down
   shows the error from a `failedRowIndices`-style query, pinned: failed rows
   are recorded as PromptRuns with `finishReason: "error"`, empty
   responseText, zero tokens, so drill-down stays uniform).
5. Increment `completedRows` (or `failedRows`), then `finalizeIfDone()`:
   if `completedRows + failedRows >= totalRows`, recompute aggregates from
   the persisted rows (idempotent, recomputation always yields the same
   result) and set `complete` + `completedAt`. avgScore/passRate/variance
   come from complete Evaluations only; runs with pending judge evals leave
   the DatasetRun `running` until their eval jobs finish (the eval job calls
   `finalizeIfDone` too).

## API contract (request/response examples)

All `{ data, error }`, Clerk-authed except `/api/jobs/dataset-row`.

`POST /api/datasets`
```json
req:  { "name": "support tickets", "description": null,
        "csvText": "question,expectedOutput\nHow do I get a refund?,mentions refund policy\n..." }
      // or { "name": "...", "rows": [ { "question": "...", "expectedOutput": "..." } ] }
res 201: { "data": { "id": "ds_1", "name": "support tickets", "columns": ["question"],
           "rowCount": 120, "createdAt": "..." }, "error": null }
res 400: { "data": null, "error": "row 3: column count mismatch (expected 2, got 5)" }
```

`GET /api/datasets/:id?offset=0&limit=50` → dataset + page of rows.
`DELETE /api/datasets/:id` → 200 `{ data: { id } }` or **409**
`"dataset has runs; delete is blocked to keep run history interpretable"`.

`POST /api/datasets/:id/run-estimate`
```json
req:  { "promptVersionId": "v_2", "model": "claude-haiku-4-5", "maxTokens": 1024 }
res:  { "data": { "rowCount": 120, "estimatedInputTokens": 54000,
        "estimatedCostUsd": 0.41, "perRowCapUsd": 0.0035 }, "error": null }
```

`POST /api/datasets/:id/run`
```json
req:  { "promptVersionId": "v_2", "model": "claude-haiku-4-5", "temperature": 0.7,
        "maxTokens": 1024, "rubricId": "rub_x",
        "variableMapping": { "question": "question" }, "confirm": true }
res 202: { "data": { "id": "drun_1", "status": "pending", "totalRows": 120,
           "completedRows": 0, ... }, "error": null }
res 400: missing confirm / unmapped variable "tone" / invalid model.
```

`GET /api/dataset-runs/:id` → full DatasetRun (client polls every 2s while
pending/running, same self-terminating pattern as `useEval`).

`GET /api/dataset-runs/:id/rows?offset=0&limit=50`
```json
res: { "data": { "rows": [ { "rowIndex": 0, "input": { "question": "..." },
       "expectedOutput": "...", "responseText": "...", "latencyMs": 812,
       "costUsd": 0.0021, "finishReason": "stop",
       "eval": { "totalScore": 0.75, "passed": true, "status": "complete" } } ],
       "total": 120 }, "error": null }
```

`GET /api/dataset-runs/:id/export` → `text/csv` attachment; **cells starting
with `= + - @` are prefixed with `'`** (spreadsheet formula-injection guard).

`POST /api/jobs/dataset-row`, QStash only; body
`{ datasetRunId, rowIndex }`; 503 without signing keys, 401 bad signature,
200 always after processing (retries handled by idempotency, not HTTP errors).

## Frontend behavior

- `/datasets`: library list (loading/error/empty mandatory), upload dialog
  with client-side papaparse preview (first 5 rows), server remains the
  validator of record.
- `/datasets/:id`: paginated row table; "Run prompt" opens RunConfigDialog:
  pick prompt → version → model → optional rubric → auto-filled variable
  mapping with per-variable column selects → estimate shown → launch disabled
  until the user ticks the confirmation checkbox.
- Run view: progress bar from `completedRows + failedRows / totalRows`,
  aggregate cards on completion (score, pass rate, variance, latency, cost),
  per-row table with eval badge and drill-down sheet, export button.
- Fix from Sprint 3 QA O1: prompt page `runsQuery` must check `res.ok` and
  throw, so HTTP errors render the error state.

## Risks / security notes

- **Cost runaway** is the top risk: estimate + `confirm: true` + 500-row cap
  + `maxTokens` cap (≤ 4096 for dataset runs).
- Fan-out partial failure: QStash dedup ids + DB-level per-row idempotency;
  `finalizeIfDone` recompute is idempotent so double-finalize is harmless.
- All new queries scoped by `userId` (DatasetRun denormalizes it; rows reach
  the user only through dataset ownership checks).
- CSV export formula injection, quote-prefix dangerous leading chars.
- Uploaded cell values flow into prompts (that is their purpose), they are
  the user's own data hitting the user's own prompt; no trust boundary
  crossed. Never interpolate dataset values into SQL or shell anywhere.
- `/api/jobs/dataset-row` shares the fail-closed signature verification;
  also pass `url` to `Receiver.verify` now (Sprint 3 review nit).
- `.bin` shims are broken on this volume, `node node_modules/typescript/lib/tsc.js`,
  `node node_modules/prisma/build/index.js`, `node node_modules/next/dist/bin/next`.

## Success criteria

1. Upload a 100+ row CSV with `expectedOutput` → columns/rowCount correct,
   reserved column split out, limits enforced with row-specific 400s.
2. Launch with rubric → 202, progress visible, every row gets a PromptRun and
   an auto-Evaluation; aggregates match hand-computed values from the rows;
   UsageSummary counts the rows as runs.
3. Judge-bearing rubric: DatasetRun stays `running` until all judge evals
   land; aggregates include judge cost.
4. Re-delivered row job (same dedup id) produces no duplicate PromptRun,
   no duplicate spend.
5. Unmapped variable, bad model, missing confirm, foreign dataset/version/
   rubric → 400/403 with field-specific messages; dataset with runs → 409 on
   delete.
6. Export opens in a spreadsheet with no formula execution.
7. `tsc --noEmit` clean; `next build` passes; no console.log.
