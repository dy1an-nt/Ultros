# Sprint 4 — Teaching Summary
> Dataset testing: CSV/JSON upload, variable mapping, batch fan-out across rows, auto-scoring, aggregate metrics, drill-down, CSV export

---

## 1. What Sprint 4 Built

Sprint 4 turned single prompt runs into experiments at dataset scale. A user uploads a CSV or JSON dataset (up to 500 rows), maps the `{{variables}}` in a prompt version to dataset columns, sees an **upper-bound cost estimate**, confirms, and launches. The platform fans out one job per row — through QStash in production, sequentially via `after()` in dev — generates a non-streaming completion for each row, persists every row as an ordinary `PromptRun`, and (if a rubric was attached) auto-scores each row through the Sprint 3 evaluation engine, judge criteria included. A new `DatasetRun` entity tracks the batch: live progress while running, then aggregate metrics on completion (average score, sample variance, pass rate, average latency, total cost including judge spend). The run view offers a per-row drill-down and a formula-injection-guarded CSV export.

This is the sprint where "every run is a first-class, scored, tracked experiment" becomes literally true, and it's deliberately load-bearing for Sprint 5: an experiment cell *is* a `DatasetRun` (the nullable `experimentId` column is already in the schema), and a regression run *is* a `DatasetRun` against a pinned dataset — which is why datasets are immutable and undeletable once they have runs.

---

## 2. File-by-File Breakdown

### Dataset engine — `lib/datasets/`

#### `lib/datasets/parse.ts`

Upload validation, shared by CSV and JSON paths, returning a uniform `ParseResult` — either `{ columns, rows, error: null }` or `{ columns: null, rows: null, error }` where the error string is the exact 400 message. The limits live here as exported constants: `MAX_ROWS = 500`, `MAX_COLUMNS = 20`, `MAX_COLUMN_NAME_LENGTH = 50`, and the column-name regex `/^[a-zA-Z0-9_ -]+$/`.

`parseCsv` wraps papaparse with two hard-won corrections (both found by executed unit tests — see section 5):

1. **Papaparse silently renames duplicate headers** (`a, a` becomes `a, a_1`) instead of erroring. The code checks `parsed.meta.renamedHeaders` and converts the rename into the validation failure it actually is: `duplicate column name "a_1"` → 400.
2. **Single-column CSVs emit a spurious `UndetectableDelimiter` "error"** — there's no delimiter to detect, papaparse defaults to comma and parses fine. That error code is filtered out as non-fatal before any other error handling.

Remaining papaparse errors with a `row` field become row-specific 400s (`row 3: Too many fields…`), matching the contract's "row-specific 400s" requirement.

`parseJsonRows` accepts an array of flat objects, rejecting nested objects per row (`row 2: nested objects are not allowed — cells must be scalar`). The column set is the **union of keys in first-seen order**, with missing cells coerced to `""` — JSON rows don't have to be rectangular, the parser makes them so.

Both paths funnel through `toRows`, which implements the **reserved-column convention**: `expectedOutput` is split out of `data` and stored on `DatasetRow.expectedOutput` (empty string → `null`), and the column cap applies only to *real* data columns. Every cell is coerced to string with `String(value)` — the dataset's job is to feed text into prompt templates, so the type system is "everything is a string" by design.

#### `lib/datasets/estimate.ts`

Three small pure functions:

- `estimateDatasetRun` — the wallet guard. For each row it interpolates the actual variables into the actual prompts and approximates tokens at **~4 characters per token** (`Math.ceil(text.length / 4)`), summing input tokens across all rows. Output is costed at the **full `maxTokens` cap for every row** — not a guess at typical output length — so the estimate is an explicit upper bound. The comment says it plainly: "a wallet guard should never under-promise." It also returns `perRowCapUsd` (worst single row) so the UI can show a per-row ceiling.
- `extractTemplateVariables` — `{{var}}` extraction from system + user prompt via `matchAll(/\{\{([^}]+)\}\}/g)`, deduped and trimmed.
- `validateMapping` — every template var must appear in the mapping, and every mapped column must exist in the dataset. Returns the field-specific message (`unmapped template variables: tone, audience`) or null. Extra dataset columns are fine — mapping is required only in the prompt→column direction.

#### `lib/datasets/runRequest.ts`

The shared loader for the two launch-adjacent routes (`run-estimate` and `run`), so estimate and launch can never disagree about what's valid. `loadRunRequest(userId, datasetId, body)` does, in order: dataset ownership (404 — the dataset is the addressed resource), prompt version ownership via its prompt (**400 "invalid promptVersionId"** for missing *or* foreign — the Sprint 3 "references you submit get 400" rule), `validateRunParams` from `lib/ai/validate.ts` plus a dataset-specific tighter cap `DATASET_RUN_MAX_TOKENS = 4096` (the general run path allows 8192; a batch multiplies maxTokens by row count, so the cap is halved), and mapping validation. If the body omits `variableMapping` entirely, an **identity mapping** is auto-built from template vars that match column names — and then still passed through `validateMapping`, so anything left unmapped is a 400, not a silent empty string.

#### `lib/datasets/runner.ts`

`launchDatasetRun()` — create the `DatasetRun` row (`pending`, `totalRows` set), then fan out. Two transports, one job:

- **Production with QStash**: one `client.publishJSON` per row to `/api/jobs/dataset-row`, each with `deduplicationId: "${run.id}:${rowIndex}"` (QStash drops exact republications) and `flowControl: { key: params.userId, parallelism: 5 }` — at most 5 of *this user's* row jobs execute concurrently, so a 500-row batch can't starve the platform or hammer one provider, and two users' batches don't compete for the same budget.
- **Dev**: `after()` with a sequential `for` loop over row indices, each wrapped in try/catch so one row's crash doesn't kill the loop. `runDatasetRowJob` is byte-identical in both paths — only transport and concurrency differ.

#### `lib/datasets/rowJob.ts`

The per-row worker: **idempotency check → generate → persist → auto-eval → finalize check.** The most important lines are near the top:

```ts
const existing = await prisma.promptRun.findFirst({
  where: { datasetRunId, datasetRowId: row.id },
  select: { id: true },
})
if (existing) return // duplicate delivery — work already done
```

The persisted `PromptRun` itself is the idempotency record. QStash's `deduplicationId` is best-effort (it prevents duplicate *publishes*, not duplicate *deliveries* of one message); this DB existence check is the actual guarantee that a redelivered row job spends nothing.

Then: bump the `DatasetRun` from `pending` to `running` (an `updateMany` conditioned on `status: "pending"` — harmless if already running), interpolate `row.data` through the stored `variableMapping`, call the non-streaming `generate()`, and persist the `PromptRun` with `datasetRowId` + `datasetRunId` linkage, tokens, latency, cost. Usage rolls into `UsageSummary` with `totalRuns: +1` — dataset rows **are** user-initiated runs, unlike judge calls (compare `runEvalJob`, which increments tokens/cost but never `totalRuns`).

On generation failure, the catch block still creates a `PromptRun` — `finishReason: "error"`, the sanitized error message as `responseText`, zero tokens, zero cost, real elapsed latency. A failed row is data, not absence of data: the drill-down and export stay uniform (every row index has exactly one row in the results), and `finalizeIfDone`'s "count persisted PromptRuns" gate counts failures too, so a batch with failures still closes.

If the run has a `rubricId`, the row is auto-scored using the **exact Sprint 3 snapshot pattern**: build `criteriaSnapshot` from the live rubric, score deterministic criteria inline with `runDeterministicCriterion`, and either create a `complete` Evaluation (no judge criteria) or create a `pending` one and call `await runEvalJob(evaluation.id)` **inline** — no QStash hop. The reasoning is in the comment: "Already inside a worker — run the judge inline, no second hop." The Sprint 3 trigger route queues because it's a request handler that must return fast; this code is already in a background job, so queuing a second job would just add latency and another delivery to make idempotent. A rubric deleted mid-batch is survivable — the ownership-checked `findUnique` comes back empty and the row simply goes unscored.

The job ends with `await finalizeIfDone(datasetRunId)` on every path.

#### `lib/datasets/finalize.ts`

`finalizeIfDone()` — fan-in. Called after every row job, after every judge eval (success *and* failure paths of `runEvalJob`), it answers "is this batch done, and if so, what are the numbers?" Its design has two principles:

1. **Gate on ground truth, not counters.** Completion is `prisma.promptRun.count({ where: { datasetRunId } }) >= run.totalRows` — the count of *persisted* rows, not `completedRows + failedRows`. The comment explains why: "a job that dies between creating its PromptRun and incrementing can't wedge the batch." Counters are a UI progress convenience; the persisted rows are the truth. It also requires zero Evaluations in `pending`/`running` for the batch — a run with judge evals still in flight stays `running` until the last judge lands.
2. **Recompute, never accumulate.** Once the gate passes, every aggregate is computed fresh from the persisted rows: mean and **sample variance** (`/(n-1)`, with `0` for a single score and `null` for none) over complete Evaluations only, pass rate over the same set, judge cost summed from `judgeCostUsd`, total cost = model cost + judge cost, average latency over non-error rows only. It then **overwrites** `completedRows`/`failedRows`/`totalCostUsd` with the recomputed values — the incremented counters from the row jobs are discarded. Because it's a pure recompute, two racing callers (last row job and last eval job finishing simultaneously) both write the same numbers; double-finalize is harmless by construction.

It also no-ops if the run is already terminal, and sets `status: "failed"` if *zero* rows succeeded.

### Shared infrastructure — `lib/ai/generate.ts`, `lib/jobs/verifySignature.ts`

#### `lib/ai/generate.ts`

Sprint 2's `lib/ai` only exported `runStream` — streaming is right when a human is watching tokens arrive, wrong when a worker needs the finished text to persist and score. `generate()` wraps the AI SDK's `generateText` with the **same** `resolveProvider` routing and the **same** `calculateCost` math as the streaming path, returning `{ text, finishReason, inputTokens, outputTokens, latencyMs, costUsd, provider }`. One model catalog, one pricing table, two delivery modes — there is no second source of truth to drift.

#### `lib/jobs/verifySignature.ts`

The Sprint 3 QStash verification logic, extracted from `/api/jobs/eval` so the new `/api/jobs/dataset-row` shares it instead of copy-pasting security code. Same fail-closed semantics: missing signing keys → 503 (misconfiguration disables, never opens), missing header → 401, body read as **text** before parsing (the signature covers exact bytes). One upgrade over Sprint 3 (a review nit from then): `Receiver.verify` now receives the **`url`** the endpoint lives at, binding the signature to the destination — a signed message captured for `/api/jobs/eval` can no longer be replayed against `/api/jobs/dataset-row`, because each route passes its own path and QStash signs the URL into the token.

### Schema — `prisma/schema.prisma` (migration `20260610051340_add_dataset_testing`)

Three new models plus two columns on `PromptRun`:

- `Dataset` — `columns String[]`, `rowCount`, cascade-deleted with the user. No `updatedAt` — datasets are immutable, there is nothing to update.
- `DatasetRow` — `data Json` (column → string), nullable `expectedOutput`, `@@unique([datasetId, rowIndex])` (the row job addresses rows by `datasetId_rowIndex`, and the constraint makes duplicate indices impossible), cascade-deleted with the dataset.
- `DatasetRun` — the batch entity. Denormalized `userId` (indexed — the same authorization trade as `Evaluation.userId` in Sprint 3), **`onDelete: Restrict`** on the dataset relation (the DB-level backstop behind the 409), config columns (`model`, `temperature`, `maxTokens`, `variableMapping Json`, `rubricId`), lifecycle (`status`, counters, `error`, `completedAt`), aggregates (all nullable until finalize), and the forward-looking **`experimentId String?`** — unused this sprint, added now so Sprint 5 attaches experiments without another migration.
- `PromptRun` gains `datasetRowId String?` (`onDelete: Cascade` — rows only die with their dataset, and that's blocked while runs exist, so the cascade is unreachable in practice) and `datasetRunId String?` with an index (the fan-in count and drill-down both query by it).

`Evaluation` is untouched: an auto-eval row is an ordinary Evaluation whose PromptRun happens to carry dataset linkage. The whole Sprint 3 engine was reused without modification to its schema.

### API routes

#### `app/api/datasets/route.ts`

GET lists the user's datasets. POST reads the body as **text first** to enforce the 2 MB payload cap *before* JSON parsing (parsing a 100 MB body just to reject it is the wrong order), validates name/description, requires **exactly one** of `csvText` or `rows` (the XOR check `(csvText === undefined) === (rows === undefined)` rejects both-or-neither), parses through `lib/datasets/parse.ts`, and inserts dataset + rows in a single `prisma.$transaction` — a dataset with half its rows is never observable. Returns 201 with the dataset summary.

#### `app/api/datasets/[id]/route.ts`

GET returns the dataset plus a page of rows (`offset`/`limit`, default 50, clamped to 200, 400 on garbage — `parsePagination` centralizes it). DELETE is where immutability gets teeth: `prisma.datasetRun.count({ where: { datasetId } }) > 0` → **409** with the contract's exact message, "dataset has runs; delete is blocked to keep run history interpretable." Only run-free datasets can be deleted (rows cascade).

#### `app/api/datasets/[id]/run-estimate/route.ts` and `run/route.ts`

Both call `loadRunRequest`; the launch route adds the two things estimate doesn't have. First, the **confirm gate** is the first body check, before any loading:

```ts
if (body.confirm !== true) {
  return Response.json(
    { data: null, error: "confirm: true is required — review the cost estimate first" },
    { status: 400 }
  )
}
```

Note `!== true`, not truthiness — `"yes"` or `1` doesn't count. Second, the optional `rubricId` is resolved with the Sprint 3 rule: missing or foreign → **400 "invalid rubricId"** (no existence oracle). Then `launchDatasetRun` and a **202** with the pending run — the same "accepted, poll for it" semantics as the Sprint 3 eval trigger, now for a whole batch.

#### `app/api/datasets/[id]/runs/route.ts`, `app/api/dataset-runs/[id]/route.ts`

Run history per dataset, and the poll endpoint. The poll authorizes with the one-line `run.userId !== user.id` check — the payoff of denormalizing `userId` onto `DatasetRun`, hit every 2 seconds per in-flight batch.

#### `app/api/dataset-runs/[id]/rows/route.ts`

The drill-down: PromptRuns for the batch ordered by `datasetRow.rowIndex` (ordering by a relation's field — Prisma supports `orderBy: { datasetRow: { rowIndex: "asc" } }`), paginated, each reshaped to the `DatasetRunRowItem` contract shape with the row's input data, expected output, response, and the **latest** evaluation (`take: 1`, newest first — a row normally has exactly one auto-eval, but a manual re-eval shouldn't break the shape). `total` comes from a parallel `count` in a `Promise.all`.

#### `app/api/dataset-runs/[id]/export/route.ts`

CSV export via `Papa.unparse` (the same library that parses uploads also serializes downloads — it handles quoting/escaping correctly, which hand-rolled CSV never does). Header is `rowIndex, …dataset columns…, expectedOutput, responseText, score, passed, latencyMs, costUsd, finishReason`. Every user-content cell passes through `guardCell`:

```ts
return /^[=+\-@]/.test(value) ? `'${value}` : value
```

Cells starting with `=`, `+`, `-`, or `@` execute as formulas when the CSV opens in Excel/Sheets — a dataset cell or model response of `=HYPERLINK(...)` would otherwise become live spreadsheet code on someone else's machine. The apostrophe prefix forces text rendering. The response is `text/csv` with a `Content-Disposition: attachment` filename.

#### `app/api/jobs/dataset-row/route.ts` and the refactored `app/api/jobs/eval/route.ts`

Both QStash webhooks are now ~25-line shells over `verifyQstashSignature(req, "/api/jobs/<name>")` + body validation + the job function. Both return **200 even when the job's work fails** — failures are recorded on the row/run by the job itself, and a 200 tells QStash "delivered, don't retry"; retry-safety lives in the idempotency checks, not in HTTP status games.

### Eval engine changes — `lib/eval/runEvalJob.ts`

Two surgical additions, both fan-in hooks. The success path loads `promptRun.datasetRunId` alongside `responseText` and, after writing `status: "complete"`, calls `finalizeIfDone(datasetRunId)` — "this eval may be the last thing holding its DatasetRun open." The **failure path does the same**: after writing `status: "failed"`, it re-fetches the linkage and calls `finalizeIfDone` too. This matters more than it looks: `finalizeIfDone` only blocks on evals in `pending`/`running`, so a *failed* eval doesn't block — but someone still has to *trigger* the re-check after the status flips, or a batch whose final judge call errored would sit at `running` forever with nothing left to nudge it. Both terminal transitions nudge.

### Frontend

#### `hooks/useDatasets.ts`, `hooks/useDatasetRun.ts`

The standard Sprint 1–3 shape: `unwrap` throwing on `!res.ok || json.error`, mutations invalidating their list keys. `useDatasetRun` is the Sprint 3 self-terminating poll verbatim — function-form `refetchInterval` returning `2000` until `complete`/`failed`, then `false`. `useLaunchDatasetRun` appends `confirm: true` to the payload (the UI's checkbox gates the button; the API contract gets its flag) and **seeds the poll cache** with `setQueryData(["datasetRun", run.id], run)` so the run view renders instantly from the 202 body. `useDatasetRunRows` takes an `enabled` flag — the row table only fetches once the run is terminal.

#### `components/datasets/DatasetUpload.tsx`

Deliberately thin: name, description, CSV/JSON toggle, a textarea, and a file input that just reads the file into the textarea (format inferred from the extension). The comment states the philosophy: "Server is the validator of record — this component just collects the text and surfaces the server's field-specific 400s." The only client-side validation is what the client can do better than a round trip (JSON.parse before sending the `rows` variant). The help text surfaces the limits and the immutability rule to the user before they hit them.

#### `components/datasets/RunConfigDialog.tsx`

The launch flow as a state machine enforced by `disabled` props: pick prompt → version → model (→ optional rubric) → mapping complete → **Estimate cost** → tick the confirmation checkbox → **Launch run**. Three details worth reading:

- `selectVersion` pre-fills the **identity mapping** for template vars that match a column name (mirroring the server's default), and the per-variable `<select>`s let the user remap; `ready` requires every extracted var to be mapped.
- Changing the version, model, or maxTokens calls `estimate.reset()` and unchecks the confirmation — you can never launch against a stale estimate. The estimate panel replaces the estimate button once data arrives, and the launch button additionally requires `estimate.data` to exist, so the sequence is structurally unskippable in the UI (the server's `confirm: true` check remains the real gate).
- The estimate is presented honestly: "estimated cost $X (upper bound; ≤ $Y/row)" and the checkbox text says what will actually happen — "I understand this will call the provider N times."

#### `components/datasets/DatasetTable.tsx`, `DatasetRunView.tsx`

`DatasetTable` is a paginated read-only row viewer (immutability means no edit affordances exist to build); the `expectedOutput` column only renders if any row has one. `DatasetRunView` is the batch lifecycle in one component: status badge → progress bar from `(completedRows + failedRows) / totalRows` with the caption "judge evals may finish after the last row" (surfacing the fan-in semantics to the user) → on terminal status, the five aggregate `Stat` cards, the paginated row table with eval badges (`—` for unscored, status text for in-flight, `0.85 ✓` / `0.42 ✗` for complete), click-to-expand `RowDetail` rows (keyed `<Fragment>` wrapping the pair of `<tr>`s — see QA findings), and the Export CSV link. Error rows render their sanitized message in red in both the table and the detail panel — uniform drill-down, as designed.

#### `app/(dashboard)/datasets/page.tsx`, `app/(dashboard)/datasets/[id]/page.tsx`

The library page (cards, loading/error/empty states, delete with a `window.confirm` that warns about the runs block — the 409's message surfaces via the mutation error if they try anyway). The detail page has `rows | runs` tabs; launching from `RunConfigDialog` flips to the runs tab and selects the new run, which immediately starts polling. Note `use(params)` — Next.js 16 delivers route params as a Promise even to client components.

#### `types/dataset.ts`

The architect-owned contract file, same role as Sprint 3's `types/eval.ts`: `DatasetDto`, `DatasetRowDto`, `DatasetRunDto` (with the `DatasetRunStatus` union), `RunEstimate`, and `DatasetRunRowItem`. Backend reshapes Prisma results into these; frontend types its hooks with them; neither side redefines anything.

---

## 3. Key Technical Decisions

### `DatasetRun`: the batch needed to be an entity

The CLAUDE.md baseline schema has `PromptRun.datasetRowId` and nothing else — you could tell *a* run touched *a* row, but there was no record of the batch itself: no status to poll, no progress counters, no place for aggregates, no stored config (which model? which mapping? which rubric?). "Run a prompt across a dataset" is an operation with a lifecycle, and lifecycles need rows. `DatasetRun` is that row: one prompt version × one model × one dataset (× optional rubric), with status, counters, config, and aggregate columns.

The forward design is the part to appreciate: Sprint 5's experiment matrix is variants × models × one dataset — and each **cell** of that matrix is exactly "one version × one model × one dataset × one rubric," i.e., a `DatasetRun`. A regression run is "the baseline's version re-run against the baseline's dataset and rubric" — also a `DatasetRun`. The nullable `experimentId` column added now (unused, unwired) means Sprint 5 attaches experiments by *writing a foreign key*, not by migrating or duplicating batch logic. Designing the entity once, here, where it's first needed, is the architect's "design it once" note made concrete.

### Dataset immutability + `Restrict` on delete

Datasets cannot be edited — no row updates, no appends; delete and re-upload instead. And a dataset with runs cannot be deleted: the API returns **409** with an explanatory message, and the schema backs it with `onDelete: Restrict` on `DatasetRun.dataset`, so even a code path that forgot the check would be stopped by the database.

The reasoning is the Sprint 3 snapshot argument with a different mechanism. A `DatasetRun`'s aggregates — and Sprint 5's baselines, which pin a `datasetId` — are only meaningful relative to the exact rows they ran against. If rows could change, "avgScore 0.82 on dataset X" would silently stop meaning anything, and a regression delta against a baseline would compare scores from *different test sets* and call it a trend. Sprint 3 solved this for rubrics by **copying** (snapshot per evaluation); copying 500 rows per run would be absurd, so datasets solve it by **freezing** (immutability + Restrict). Two mechanisms, one invariant: a historical score's inputs must never drift. The trade-off — fixing a typo in one cell means re-uploading — is accepted and surfaced in the upload UI's help text.

### Cost estimate + the `confirm: true` gate

The architect named cost runaway the top risk: a 500-row batch against an expensive model is a wallet-drain misclick. The defense is layered: the 500-row cap and the 4096 `maxTokens` cap bound the worst case; `POST .../run-estimate` prices the actual interpolated prompts (chars/4 input heuristic, output costed at **full `maxTokens` per row**) so the number shown is an upper bound that can only be pleasant-surprised downward; and the launch route requires a literal `confirm: true` in the body — checked before anything else, strictly `!== true`.

Why an upper bound rather than a best guess? Because the two failure modes are asymmetric. An overestimate costs nothing (the user double-checks, maybe picks a cheaper model). An underestimate that a user confirmed is a broken promise with a bill attached. The chars/4 heuristic is crude — real tokenizers vary by model and content — but a pre-launch sanity number doesn't need tokenizer precision, it needs the right sign on its error. And the gate is server-side by design: the UI's checkbox/estimate sequencing is UX, but `confirm: true` in the API contract means a script hitting the endpoint directly gets the same protection.

### Per-row fan-out with `deduplicationId` and `flowControl`

One QStash message per row, not one message for the whole batch. A monolithic "run all 500 rows" job would hold a single serverless invocation across 500 sequential LLM calls — guaranteed to blow past any function timeout — and one row's crash would orphan the rest. Per-row messages make each unit of work small, independently retryable, and parallelizable.

Two QStash features shape the fan-out (`lib/datasets/runner.ts`): `deduplicationId: "${run.id}:${rowIndex}"` gives each row a stable identity so a re-published message (e.g., a retried launch) collapses to one delivery, and `flowControl: { key: userId, parallelism: 5 }` is **backpressure** — at most 5 concurrent row jobs *per user*, so one user's 500-row batch becomes a steady drip rather than a thundering herd against the provider API (and against the per-user rate limits providers enforce). Keying flow control by `userId` rather than globally means users don't queue behind each other.

Dev uses a sequential `after()` loop — QStash can't reach localhost (same reasoning as Sprint 3) — with each iteration try/caught so one row's throw doesn't kill the loop. The job function is identical; only transport, ordering, and concurrency differ.

### DB-level idempotency: the PromptRun existence check is the guarantee

QStash's `deduplicationId` prevents duplicate *publishes*, but delivery is still at-least-once — a slow 200, a network blip, and the same message arrives twice. The real idempotency mechanism is in `rowJob.ts`: before doing anything billable, look up a `PromptRun` with this `(datasetRunId, datasetRowId)` pair; if one exists, return. The persisted result *is* the "this work happened" record — no separate ledger, no distributed lock. QStash dedup is treated as an optimization that reduces how often the DB check fires, never as the correctness mechanism. This is the layered-defenses posture: the cheap best-effort layer up front, the authoritative check at the resource.

(Honest caveat, same family as Sprint 3's claim-window finding: `findFirst`-then-create is not a single atomic statement, so two *simultaneous* deliveries of the same row could in principle both pass the check. With QStash dedup ahead of it and `parallelism: 5` serializing most of a user's jobs, the window is vanishingly small, and the damage is one duplicate row run — `finalizeIfDone`'s recompute would still produce consistent aggregates over whatever rows exist. This was closed before commit: `@@unique([datasetRunId, datasetRowId])` on PromptRun (migration `20260610053000_unique_dataset_row_run`) plus a P2002 catch in `rowJob.ts` that treats the losing delivery as a no-op — the DB is now the arbiter, not the lookup. The one cost the constraint can't recover is the loser's provider call, which had already happened before the insert failed; QStash dedup keeps that window negligible.)

### `finalizeIfDone`: an idempotent recompute gated on ground truth

The fan-in question — "is the batch done?" — has a tempting wrong answer: check `completedRows + failedRows >= totalRows` and, on the last increment, compute aggregates incrementally. Two failure modes kill it. First, a job that dies *between* creating its PromptRun and incrementing its counter leaves the counter permanently one short — the batch wedges at 499/500 forever with no event left to fire. Second, incrementally accumulated aggregates (running mean, running variance) are only correct if every increment happens exactly once — precisely what an at-least-once world refuses to promise.

`finalizeIfDone` rejects both: the completion gate is `COUNT(PromptRun WHERE datasetRunId) >= totalRows` — derived from what's *actually persisted*, which is exactly what the idempotency check also keys on, so the two mechanisms can't disagree — plus zero pending/running Evaluations. And the aggregates are a **full recompute** from the persisted rows, after which the counters themselves are overwritten with recomputed values. Recompute-over-increment buys convergence: the function is a pure function of database state, so calling it twice, calling it from two racing jobs (last row and last judge eval finishing together), or calling it after a partial crash all land on the same final numbers. The counters incremented during the run are demoted to what they really are — progress-bar fuel — and the end-state truth comes from counting real rows.

### Failed rows are PromptRuns too

When generation throws, the row job persists a `PromptRun` with `finishReason: "error"`, the sanitized error as `responseText`, zero tokens/cost, and real latency. The alternative — no row, plus an error stashed somewhere else — would bifurcate every downstream consumer: drill-down would need a union of two shapes, export would need a second code path, and `finalizeIfDone`'s count gate would need a second table to consult. By making failure a *kind of result* rather than an *absence of result*, one query shape serves everything; the UI just branches on `finishReason === "error"` for styling, and `finalizeIfDone` filters error rows out of latency/score math while still counting them toward completion. `sanitizeErrorMessage` (Sprint 3's API-key redactor) guards the persisted message, since it now also flows into CSV exports.

### Judge evals chained inline; `runEvalJob` finalizes on success *and* failure

Sprint 3's rule — "AI-judge always goes through QStash, never synchronously in a request handler" — is about request handlers, not about judging. The row job is already a queued worker: enqueueing the judge as a *second* QStash message would add a publish, a delivery, another signature verification, and another idempotency window, for zero benefit — there's no HTTP response being held open. So `rowJob.ts` calls `await runEvalJob(evaluation.id)` directly. The claim transition inside `runEvalJob` still runs, so the call remains safe if the *row job* is redelivered (a redelivery exits at the PromptRun check before ever reaching the eval anyway).

The fan-in hooks added to `runEvalJob` are the subtle part. A batch with judge criteria isn't done when the last row generates — it's done when the last *eval* terminates. So `finalizeIfDone` blocks on pending/running evals, and `runEvalJob` calls it after reaching **either** terminal state. The failure path is the one people forget: a failed eval doesn't *block* the gate (only pending/running do), but the status flip from `running` to `failed` is an event, and if no one re-checks the gate after it, a batch whose final judge call errored has no remaining trigger — it would sit at `running` forever. Both terminal transitions nudge; the nudge is idempotent; the batch always closes.

### Auto-scoring reuses the Sprint 3 snapshot pattern exactly

The row job's eval-creation block is structurally the Sprint 3 trigger route: build `criteriaSnapshot` from the rubric *as it exists now*, deterministic criteria scored inline, `evalMethod` derived from the criteria split, complete-immediately vs. pending-then-judge. Same `Prisma.InputJsonValue` casts, same `computeTotalScore`, same `>=` threshold. This is deliberate non-invention: the eval signal Sprint 5 regression-tests against must be *identical* whether a run was scored manually (Sprint 3) or automatically (Sprint 4) — a score must mean one thing. The only behavioral addition is tolerance for a rubric deleted mid-batch: the row goes unscored rather than failing, because a half-scored batch is more useful than a dead one.

### Non-streaming `generate()` vs `runStream`

Streaming exists for humans: tokens render as they arrive, perceived latency drops. A batch worker has no human watching — it needs the complete text (to persist and to score), the final token counts, and the finish reason. Buffering a stream to reassemble the full text would re-implement `generateText` badly. The CLAUDE.md "never buffer a full response" rule is about *user-facing responses*; `generate()` is the legitimate non-streaming path for machine consumers, sharing `resolveProvider` and `calculateCost` with the streaming path so routing and pricing can't fork.

### URL binding in the shared signature verification

Extracting `verifyQstashSignature` was DRY for security code (two webhooks, one verifier, one place to audit). The functional improvement is passing `url` to `Receiver.verify`: QStash signs the destination URL into its JWT, and verifying it means a signature minted for one endpoint is rejected at another. Without it, a captured signed request for the eval webhook could be replayed at the dataset-row webhook (both would verify "this came from QStash" — but not "this was *for me*"). Each route passes its own path; the helper composes it with `NEXT_PUBLIC_APP_URL`.

### CSV formula injection: output encoding for a non-browser renderer

XSS is "user content rendered as code in a browser"; CSV injection is the same vulnerability where the renderer is a spreadsheet. Excel and Sheets execute cells starting with `=`, `+`, `-`, `@` — and this export contains *model output* and *uploaded cells*, both attacker-influenceable in principle (a prompt could ask the model to emit `=IMPORTDATA(...)`). `guardCell` prefixes dangerous leading characters with `'`, the spreadsheet convention for "literal text." The general lesson: sanitize at the boundary where content meets its renderer, and know *all* the renderers your data reaches — the same `responseText` is HTML-escaped by React in the drill-down and apostrophe-guarded in the CSV.

---

## 4. Patterns to Know

### Fan-out / fan-in — `runner.ts` + `finalize.ts`

Split a batch into N independent jobs (fan-out), detect collective completion and aggregate (fan-in). The hard half is always fan-in: with no orchestrator process watching, completion detection must be event-driven (every job-terminal event calls `finalizeIfDone`) and the check must be safe under concurrent and repeated invocation. Same family as MapReduce's map/reduce and `Promise.all` — but durable, across processes, with retries.

### Idempotency keys — `deduplicationId` and the `(datasetRunId, datasetRowId)` check

A stable identity for a unit of work, checked before doing the work. Two tiers here: the transport-level key (QStash dedup, best-effort) and the resource-level check (does the PromptRun already exist — authoritative). The Stripe idempotency-key pattern, with the persisted business record doubling as the dedup ledger.

### Recompute-over-increment for convergence — `finalizeIfDone`

When state is updated by many concurrent, possibly-retried actors, derive final values by recomputing from source-of-truth rows instead of trusting accumulated counters. Recomputation is idempotent by construction — f(db state) — so races and retries converge instead of compounding. Increments are kept only where approximate is fine (the progress bar). Related ideas: event sourcing's "state is a fold over events," self-healing aggregates.

### Upper-bound estimation — `estimate.ts`

When an estimate gates an irreversible, costly action, bias it conservatively and *say so* ("upper bound" in the UI). Precision is secondary to the sign of the error: never under-promise a cost, never over-promise a capacity. The chars/4 heuristic is acceptable *because* the maxTokens output assumption dominates the bound anyway.

### Capability checks / confirmation gates — `confirm: true`

Dangerous operations require explicit, structured intent in the request itself — not a UI affordance, a contract field, checked first and strictly (`!== true`). Same family as `--force` flags, GitHub's "type the repo name to delete," and AWS's `"DeletionPolicy"`. The server-side placement is the point: the gate must hold for clients that never saw the UI.

### Reserved-column convention — `expectedOutput` in `parse.ts`

A magic name inside user data that the system lifts out into structure (`DatasetRow.expectedOutput`), documented at the boundary and excluded from the ordinary-column cap. Convention-over-configuration applied to data ingestion: zero extra UI for the common case, at the price of one name users can't use for themselves. The parser is the single place the convention is implemented, so nothing downstream knows it exists.

### Freezing vs. snapshotting — dataset immutability vs. Sprint 3's `criteriaSnapshot`

Two implementations of the same invariant (a historical measurement's inputs must not drift): copy the input into the record (snapshot — cheap when small, like a rubric) or forbid the input from changing (freeze + `Restrict` — necessary when copying is too big, like 500 rows). Choosing between them is a size/ownership question, not a correctness one.

### Worker-inline chaining — `rowJob` → `runEvalJob`

Queue hops exist to decouple request handlers from slow work. Between two pieces of *already-backgrounded* work, a hop adds latency and failure surface for nothing — call the job function directly and rely on its existing idempotent claim. Queue when crossing the request/background boundary; call when already on the background side.

---

## 5. QA Findings Worth Knowing

- **Executed unit tests (24 assertions) caught two real papaparse behaviors.** This sprint's parser QA actually ran code rather than only reading it, and both findings were library behaviors no amount of code reading would surface: (1) **duplicate CSV headers are silently renamed**, `a, a` → `a, a_1`, so a naive parser would accept a corrupt dataset with an invented column name — fixed by checking `parsed.meta.renamedHeaders` and returning the duplicate-column 400; (2) **single-column CSVs emit a spurious `UndetectableDelimiter` error** (there's no delimiter to detect; parsing still succeeds) — fixed by filtering that code as non-fatal before error handling. Both fixes live in `parseCsv` in `lib/datasets/parse.ts` with comments explaining the papaparse quirk. Lesson: the behavior of a dependency at its edges is an empirical question.
- **Keyless React fragments in `DatasetRunView`'s expandable rows.** Each row renders as *two* `<tr>` elements (the row and its conditional detail row) wrapped in a fragment inside a `.map` — the shorthand `<>` can't take a key, so the original code had no key where React needed one, risking mis-reconciled expansion state across pagination. Fixed with the explicit `<Fragment key={row.rowIndex}>` form. Worth remembering: `<>` and `<Fragment>` differ in exactly one capability, and lists of multi-element groups are where it bites.
- **Sprint 3's O1 fixed:** the prompt page `runsQuery` (`app/(dashboard)/prompts/[id]/page.tsx`) now checks `res.ok` and throws, so an HTTP error from `/api/prompts/:id/runs` renders the error state instead of masquerading as "No runs yet." This was the carried-over cosmetic finding from the Sprint 3 QA report, pinned in the architect plan as a must-fix this sprint.
- **The Rubrics nav link was missing.** The Sprint 3 rubrics page existed but `app/(dashboard)/layout.tsx` never linked it — reachable only by typing the URL. Both Rubrics and Datasets entries are now in the nav. A reminder that "the feature works" and "the feature is discoverable" are separate QA checks.

---

## 6. Interview Prep

After this sprint, you should be able to explain:

- **"How do you make a 500-job batch safe under at-least-once delivery?"** — Layered idempotency. Transport layer: QStash `deduplicationId` per row, best-effort. Resource layer: before doing billable work, check whether the work's output already exists — the `(datasetRunId, datasetRowId)` PromptRun lookup in `rowJob.ts`. The persisted business record *is* the idempotency ledger, so the check and the truth can't drift apart. Know the residual `findFirst`-then-create race and how a unique constraint would close it.
- **"Why recompute aggregates instead of incrementing them?"** — Increments are only correct under exactly-once execution, which a retried, concurrent system doesn't offer; a crash between persisting a result and incrementing a counter wedges any counter-gated completion check forever. `finalizeIfDone` gates on `COUNT(persisted PromptRuns)` — ground truth — and recomputes mean/variance/pass-rate/cost from rows, then overwrites the counters. A pure function of DB state converges no matter how many times or how concurrently it runs. Counters survive only as progress-bar fuel.
- **"How do you stop one user's batch from hammering the system?"** — Backpressure at the queue: QStash `flowControl` keyed by `userId` with `parallelism: 5`. The fan-out publishes all 500 messages immediately, but delivery is throttled to 5 concurrent per user — protecting provider rate limits, serverless concurrency, and other users. Keying per-user (not globally) is the fairness decision. Contrast with the dev path: sequential loop, parallelism 1, same job code.
- **"Why are datasets immutable?"** — Sprint 5 baselines pin a `datasetId`; a regression delta is only meaningful if both runs hit identical rows. Mutable rows would make "score 0.82 on dataset X" silently unstable. Immutability + 409-on-delete (`Restrict` at the DB level as backstop) is the freeze strategy; compare with Sprint 3's copy strategy (rubric snapshots) and explain when each fits — copy when small, freeze when copying is prohibitive.
- **"Walk me through what happens when a row fails."** — A PromptRun is still created: `finishReason: "error"`, sanitized message as the text, zero tokens. Failure as a kind of result keeps drill-down/export/completion-counting on one query shape, keeps the fan-in gate accurate, and the UI just styles on `finishReason`. Failed rows are excluded from latency and score aggregates but counted toward completion.
- **"When would you *not* enqueue work to a queue?"** — When you're already in a worker. The row job calls `runEvalJob` inline rather than publishing a second QStash message: no request handler to unblock, so the hop would buy only latency and another delivery to make idempotent. The rule "judge evals go through QStash" is really "don't hold request handlers open across LLM calls."
- **"How can an async batch get stuck, and how did you prevent it?"** — Enumerate the wedge scenarios: job dies between persist and increment (solved: gate counts persisted rows, not counters); last judge eval *fails* and nothing re-checks the gate (solved: `runEvalJob` calls `finalizeIfDone` on the failure path too, since failed evals don't block but their transition must trigger a re-check); two finishers race (solved: recompute is idempotent, both write the same numbers).
- **"What's CSV injection?"** — Formula execution in spreadsheets: cells starting `= + - @` are evaluated by Excel/Sheets, and the export contains model output and uploaded cells. Apostrophe-prefix dangerous leading chars at export time (`guardCell`). Generalize: output-encode for each renderer your data reaches — React escapes for HTML, `guardCell` escapes for spreadsheets, same data, two boundaries.
- **"Why is the cost estimate an upper bound, and why gate on `confirm: true`?"** — Asymmetric failure modes: overestimates are free, confirmed underestimates are bills. So output is costed at full `maxTokens` × rows; chars/4 is fine because the bound, not precision, is the product. The gate is a contract field checked server-side and strictly (`!== true`) so non-UI clients are equally protected; the UI's estimate→checkbox→launch sequencing (with reset on any config change) is UX reinforcement, not the mechanism.
- **"How does Sprint 5 reuse this?"** — `DatasetRun` was designed as the universal batch cell: an experiment is a set of DatasetRuns (one per variant × model) over the same dataset/rubric — the nullable `experimentId` FK already exists; a regression run is a DatasetRun of the baseline's version/dataset/rubric compared against stored baseline aggregates. The fan-out/fan-in machinery, idempotency, and finalize logic all transfer without modification.

---

## 7. Go Deeper

**Fan-out/fan-in and batch orchestration**
- [Fan-out/fan-in pattern (Azure Durable Functions docs)](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview#fan-in-out) — the named pattern, including why fan-in is the hard half
- [QStash flow control](https://upstash.com/docs/qstash/features/flowcontrol) — parallelism and rate keys; what the `key` actually scopes
- [QStash deduplication](https://upstash.com/docs/qstash/features/deduplication) — what `deduplicationId` does and doesn't guarantee

**Idempotency and convergence**
- [Idempotency keys (Stripe engineering)](https://stripe.com/blog/idempotency) — still the canonical writeup; map their "recovery point" idea onto the PromptRun existence check
- [Designing Data-Intensive Applications, ch. 11 (Kleppmann)](https://dataintensive.net/) — exactly-once semantics as "at-least-once + idempotence," the framing this sprint implements
- [Prisma unique constraints + P2002 handling](https://www.prisma.io/docs/orm/reference/prisma-client-reference#unique) — the create-and-catch upgrade path for the row-job race

**Statistics for eval aggregation**
- [Sample vs. population variance (Bessel's correction)](https://en.wikipedia.org/wiki/Bessel%27s_correction) — why `finalizeIfDone` divides by n−1
- [Welford's online algorithm](https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm) — the incremental-variance approach this sprint deliberately *didn't* use, and why retries make it treacherous

**CSV and data ingestion**
- [OWASP: CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection) — the formula-execution attack and the prefix mitigation
- [Papaparse docs](https://www.papaparse.com/docs) — read the `meta` object section; `renamedHeaders` and the error model are where the QA findings live
- [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) — what CSV formally is, and why you never hand-roll quoting

**Tokens and cost estimation**
- [Anthropic token counting API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting) — the precise alternative to chars/4, and when the precision is worth a network call
- [OpenAI: What are tokens?](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them) — where the ~4-chars heuristic comes from and how it varies by language/content

**Queues and backpressure**
- [Reactive Streams / backpressure explained](https://www.reactive-streams.org/) — the general concept `flowControl` implements at the queue layer
- [Vercel AI SDK `generateText`](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-text) — the non-streaming primitive behind `lib/ai/generate.ts`

**React reconciliation**
- [React docs: rendering lists & keys](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key) — and the [`Fragment` key form](https://react.dev/reference/react/Fragment) that the DatasetRunView fix uses
