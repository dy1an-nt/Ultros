# Sprint 3: Teaching Summary
> Evaluation engine: rubrics, deterministic matchers, AI-as-judge, eval history, version leaderboard

---

## 1. What Sprint 3 Built

Sprint 3 turned Ultros from a prompt runner into an evaluation platform. A user can now build a **rubric**, a named set of weighted criteria, each one either deterministic (exact match, regex, JSON schema, contains) or AI-judged (a judge model scores the output against natural-language instructions), and score any saved run against it. Deterministic criteria are scored synchronously in the request; AI-judge criteria are scored asynchronously by a queued job (QStash in production, an in-process fallback in dev). Every evaluation stores a frozen snapshot of the rubric it was scored with, so editing or deleting a rubric never rewrites history. The prompt detail page gained an Evals tab (trigger an eval per run, watch it complete via polling, browse history) and a Leaderboard tab (average score and pass rate per prompt version). Judge token usage and cost are recorded per evaluation and rolled into the daily `UsageSummary`.

This is the sprint the rest of the roadmap leans on: Sprint 4's dataset runs will auto-score every row through this engine, and Sprint 5's baselines and regression detection are only meaningful because scores here are reproducible and immutable.

---

## 2. File-by-File Breakdown

### Scoring engine: `lib/eval/`

#### `types/eval.ts`

The shared contract, written by the architect before either backend or frontend started, both sides import from here and neither redefines the shapes, that's the point of a contract file, the key types:

- `Criterion`. `{ name, type, weight, config }` where `config` is a **discriminated-by-type union**: `{ instructions }` for `ai_judge`, `{ expected, caseSensitive?, trim? }` for `exact`, `{ pattern, flags? }` for `regex`, `{ schema }` for `json_schema`, `{ substring, caseSensitive? }` for `contains`. Each criterion type carries exactly the configuration it needs and nothing else.
- `CriterionScore`. The output shape: name, type, weight, a score in [0, 1], and a human-readable `detail` string ("substring found", "schema violation at /answer: …", or the judge's one-sentence reasoning).
- `CriteriaSnapshot`. `{ rubricName, passThreshold, criteria }`, the frozen copy stored on every Evaluation.
- `EvalStatus` (`pending | running | complete | failed`) and `EvalMethod` (`deterministic | ai_judge | mixed`).

#### `lib/eval/criteria.ts`

Validation of untrusted rubric payloads, shared by the rubric CRUD routes. All the limits from the architect contract live here as exported constants: `MAX_CRITERIA = 20`, `MAX_REGEX_PATTERN_LENGTH = 500`, `ALLOWED_REGEX_FLAGS = "imsu"`, `MAX_SCHEMA_BYTES = 10 KB`, `REGEX_INPUT_CAP = 100 KB`, etc.

`validateCriteria(input: unknown)` walks the array and returns either a typed `Criterion[]` or a **field-specific error string** like `criteria[0].config.pattern: invalid regex`. The exact string the API returns in a 400. Notice what gets validated beyond shape: criterion names must be unique within the rubric (a `Set` check. This matters because scores are later merged by name), weights must be finite, `> 0`, and `<= 100`, regex patterns are compiled in a try/catch, regex flags are restricted to a safe subset, and JSON schemas are both size-capped and compiled with Ajv (`strict: false`) to prove they're valid schemas before they're ever stored.

#### `lib/eval/matchers.ts`

The four deterministic scorers, each a pure function `(config, responseText) → { score: 0 | 1, detail }`:

- `scoreExact`, optional trim and case-folding, then `===`.
- `scoreRegex`, compiles the pattern, then tests against **only the first 100 KB** of the response (`responseText.slice(0, REGEX_INPUT_CAP)`). This is the ReDoS mitigation: JavaScript regexes have no timeout, so a pathological pattern against a huge input could hang the serverless function. Capping the input bounds the damage; the pattern-length and flag caps in `criteria.ts` are the other half of the defense.
- `scoreJsonSchema`. `JSON.parse` the response (failure scores 0 with "response is not valid JSON"), then Ajv-validate, the detail string includes the first violation path, e.g. `schema violation at /answer: must be string`.
- `scoreContains`, case-folded `String.includes`.

`runDeterministicCriterion` dispatches on `criterion.type` and throws if handed an `ai_judge` criterion, that's a programmer error, not a scoring outcome.

`computeTotalScore` is the pinned math: `Σ(weightᵢ × scoreᵢ) / Σ(weightᵢ)`. Five lines, but it's a contract, see section 3.

#### `lib/eval/judge.ts`

The AI-judge call. `judgeCriteria(criteria, responseText)` makes **one** `generateObject` call (Vercel AI SDK structured output) covering all ai_judge criteria at once, with a zod schema demanding `{ criteria: [{ name, score: 0–1, reasoning }] }` and `temperature: 0`. The judge model defaults to `claude-haiku-4-5`, overridable via the `JUDGE_MODEL` env var but gated by `isModelAvailable` so a typo fails loudly instead of silently routing to nothing.

Two defensive details after the call returns:

1. Scores are clamped to [0, 1] via `clamp01`. The zod schema already constrains them, but `clamp01` also handles `NaN`/`Infinity` (returns 0), never trust a model output even when a schema "guarantees" it.
2. The judge's results are re-keyed by criterion name (`new Map(object.criteria.map(...))`) and walked **in the rubric's criterion order**, not the judge's output order. A criterion the judge skipped scores 0 with the detail "judge did not return a score for this criterion". Missing data fails closed, never crashes.

Judge cost is computed with `calculateCost` from `lib/ai/pricing.ts` and returned alongside token counts.

#### `lib/eval/runEvalJob.ts`

The async job body: **claim → judge → merge → complete/fail**. This is the most carefully designed function in the sprint.

The claim is the first statement:

```ts
const claimed = await prisma.evaluation.updateMany({
  where: { id: evaluationId, status: { in: ["pending", "running", "failed"] } },
  data: { status: "running", error: null },
})
if (claimed.count === 0) return
```

This is a **compare-and-swap** implemented as a conditional update: "set status to running, but only if it isn't already complete." If `count === 0`, the row is either nonexistent or terminal, either way, no-op. This single statement is what makes QStash's at-least-once delivery safe (see section 3).

Then: load the evaluation with its run's `responseText`, pull the **snapshot** criteria (never the live rubric: the rubric may have changed or been deleted), judge the ai_judge criteria, merge judge scores with the deterministic scores stored at trigger time (merged by name, re-ordered to the snapshot's criteria order), compute the weighted total against the **snapshot's** `passThreshold`, and write `status: "complete"` with the judge usage fields. Judge tokens and cost are upserted into `UsageSummary` for today's UTC date. `totalRuns` is deliberately untouched, because a judge call is not a user-initiated run.

The catch block writes `status: "failed"` with an error message passed through `sanitizeErrorMessage`, which string-replaces every known API key env value with `[redacted]` and truncates to 2000 chars. Provider error messages sometimes echo request headers; this guarantees an API key can never be persisted to the database or rendered in the UI.

#### `lib/eval/queue.ts`

`enqueueEvalJob(evaluationId)`, eight effective lines that pick the transport:

- **Production with QStash configured**: publish `{ evaluationId }` to `${NEXT_PUBLIC_APP_URL}/api/jobs/eval` via the QStash client. QStash will POST it back with a signature, retrying on failure.
- **Everything else (dev)**: `after(() => runEvalJob(evaluationId))`. Next.js's `after()` keeps the serverless invocation alive past the response and runs the callback in-process, no HTTP hop, no tunnel.

Why the fallback exists: QStash is a cloud service that delivers jobs by making HTTP requests to your URL. `localhost:3000` is not reachable from Upstash's servers, so in dev there is nothing for QStash to call. Deployment is Sprint 6; until then `after()` gives the same "respond first, work later" semantics in one process.

### Queue webhook: `app/api/jobs/eval/route.ts`

The only route in the app not protected by Clerk, it's called by QStash, not a browser. Its security posture is **fail-closed**:

1. If `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` are missing → **503**, refuse to run. An unsigned endpoint that executes arbitrary `evaluationId`s would let anyone on the internet burn judge tokens on your API key. Misconfiguration must disable the route, never open it.
2. Missing `upstash-signature` header → 401.
3. The raw body text is verified with `Receiver.verify({ signature, body })` from `@upstash/qstash`. Note that the body must be read as **text** before parsing, because the signature covers the exact bytes.
4. Only after verification is the JSON parsed and `runEvalJob` invoked.

The route returns 200 even when the eval itself fails, `runEvalJob` records failures on the row rather than throwing. A 200 tells QStash "delivered, don't retry"; retry semantics are handled by the idempotent claim, not by HTTP status games.

### API routes

#### `app/api/rubrics/route.ts` and `app/api/rubrics/[id]/route.ts`

Standard CRUD following the Sprint 1 ownership pattern (Clerk ID → DB user → `userId` check; 404 for nonexistent, 403 for foreign). POST validates name, description, threshold, and criteria through `lib/eval/criteria.ts` and returns the field-specific error on 400. PATCH allows partial updates of name/description/passThreshold, but criteria are **replaced wholesale** if present, no per-criterion merging, which would be ambiguous (matched by index? by name?). DELETE just deletes; the comment in the file says why that's safe: "Evaluations keep their criteriaSnapshot; rubricId becomes null via SetNull."

One line worth understanding in POST:

```ts
criteria: criteria as unknown as Prisma.InputJsonValue,
```

`Criterion["config"]` includes `Record<string, unknown>` (the JSON schema config), and `unknown` is not assignable to Prisma's `InputJsonValue` (a recursive union of JSON-representable types). TypeScript checks structurally and can't prove an `unknown` is JSON-safe. The double cast is the standard escape hatch; it's sound here because `validateCriteria` already proved the value is plain JSON data.

#### `app/api/runs/[runId]/eval/route.ts`

The trigger route, implementing the architect's eval flow exactly:

1. Auth, load the run, 404/403 per conventions.
2. Load the rubric, but a missing **or foreign** rubric returns **400 "invalid rubricId"**, not 404/403. The run is the resource being acted on; the rubric ID is just an input parameter, and distinguishing "doesn't exist" from "belongs to someone else" would leak whether another user's rubric ID is valid.
3. Build the `criteriaSnapshot` from the rubric as it exists right now.
4. Score all deterministic criteria synchronously with `runDeterministicCriterion`.
5. If there are no ai_judge criteria: compute the total, create the Evaluation as `complete`, return **200** with the finished result, the user sees their score in one round trip.
6. Otherwise: create the Evaluation as `pending` with the partial deterministic scores already stored in `criteriaScores`, call `enqueueEvalJob`, return **202** (Accepted, "I've started, poll for the result").

The `evalMethod` ternary (`deterministic` / `ai_judge` / `mixed`) is computed here from the criteria split and stored, so the UI can label evals without re-deriving anything.

#### `app/api/evals/[id]/route.ts`

The poll endpoint: load the Evaluation, check `evaluation.userId !== user.id` → 403. This one-line ownership check is the payoff of denormalizing `userId` onto Evaluation, without it, authorization would require joining Evaluation → PromptRun → userId on every 2-second poll.

#### `app/api/prompts/[id]/evals/route.ts`

Eval history: after the prompt ownership check, queries Evaluations `where: { userId: user.id, promptRun: { promptId: id } }`, note the relation filter reaching through PromptRun, newest first, with a `limit` query param (default 50, clamped to 200, 400 on garbage). Each row is reshaped to join in `{ run: { id, model, createdAt, promptVersionId, versionNumber } }`, flattening the nested `promptVersion.versionNumber` so the frontend gets the `EvalHistoryItem` shape from the contract without knowing the Prisma include structure.

#### `app/api/prompts/[id]/leaderboard/route.ts`

Pulls all **complete** evaluations for the prompt (optionally filtered by `rubricId`), then aggregates in application code with a `Map<promptVersionId, bucket>`: sum scores, count passes, count evals, then emit `avgScore`, `passRate`, `evalCount` per version, sorted by `avgScore` descending. Aggregating in JS rather than SQL `GROUP BY` is fine at this scale (one user's evals for one prompt) and keeps the code readable; Sprint 4's dataset-scale aggregation is where a SQL approach gets revisited.

### Frontend

#### `hooks/useRubrics.ts`, `useEval.ts`, `useEvalHistory.ts`, `useLeaderboard.ts`

Thin TanStack Query wrappers, each with a small `unwrap` helper that throws on `!res.ok || json.error` so the `{ data, error }` envelope becomes a thrown `Error` that TanStack surfaces as `query.error`, the rubric mutations invalidate `["rubrics"]` on success, the standard mutation → invalidation → refetch loop from Sprint 1.

The interesting one is `useEval`:

```ts
refetchInterval: (query) =>
  isTerminalEvalStatus(query.state.data?.status) ? false : 2000,
```

TanStack Query's `refetchInterval` accepts a **function of the current query state**, so polling is self-terminating: every 2 seconds while the eval is `pending`/`running`, then `false` (stop) once it's `complete` or `failed`. No `setInterval`, no cleanup effect, no leaked timers.

`useTriggerEval` does one more clever thing: on success it **seeds the poll cache** with `queryClient.setQueryData(["eval", evaluation.id], evaluation)`. The POST response *is* an Evaluation, so the subsequent `useEval` query starts with data already in cache, for a deterministic-only rubric (200, already complete) the result renders instantly and the poll never fires even once.

#### `components/eval/CriterionEditor.tsx`

The criterion form, with one design decision worth studying: the editing state is a flat `CriterionDraft` containing **every** config field (`instructions`, `expected`, `pattern`, `flags`, `schemaText`, `substring`, …) regardless of the selected type, plus `weight` as a *string* and the JSON schema as raw *text*. The draft converts to the strict `Criterion` union only on save (`draftToCriterion`), and only after `validateCriterionDraft` passes.

Why flat and stringly? Two reasons, first, switching a criterion's type in the dropdown shouldn't destroy what you typed, with a flat draft, the regex pattern survives a round trip through "Exact Match" and back. Second, a controlled `<textarea>` for a JSON schema must be able to hold *invalid* JSON mid-keystroke; you can't store `Record<string, unknown>` in React state while the user is halfway through typing `{ "type": `, the draft/domain split (sometimes called a form model vs. domain model) is the general pattern.

`validateCriterionDraft` mirrors the server limits from the contract (lengths, flags `^[imsu]*$`, regex compilation, JSON parse) so users get instant feedback, but the server validation remains authoritative. Client validation is UX, server validation is security.

#### `components/eval/RubricBuilder.tsx`

Create/edit form (edit mode when `initial` is passed; the rubrics page keys it with `key={editing?.id ?? "new"}` so switching rubrics remounts with fresh state), plain `useState` per the architect's note, no Zustand needed for a local form. It computes a live `totalWeight` and passes each row its `weightShare` so the UI shows "this criterion is 33% of the score", making the weighted-mean math visible. Validation errors are held back until the first submit (`submitted` flag) so users aren't yelled at while typing.

#### `components/eval/EvalTrigger.tsx`

The per-run "Evaluate" control on the prompt page: button → rubric `<select>` → `useTriggerEval().mutate` → store the returned eval ID → `useEval(evalId)` polls → `<EvalResult>` renders live (a pulsing "Queued…"/"Judging…" badge while in progress). A `useEffect` watches for the polled status hitting a terminal state and invalidates `["evals", promptId]` and `["leaderboard", promptId]` so the other tabs refresh without a reload. All three data states (loading, error, empty-with-a-link-to-create-a-rubric) are handled per the CLAUDE.md mandate.

#### `components/eval/EvalResult.tsx`, `EvalHistory.tsx`, `Leaderboard.tsx`, `RubricCard.tsx`

`EvalResult` is the shared result card: total score, PASS/FAIL badge (`PassBadge` renders nothing for `null`. An in-flight eval has no verdict yet), per-criterion table with weight/score/detail, collapsible judge reasoning, and a footer with judge model and cost to six decimals. Note it reads the rubric name and threshold from `evaluation.criteriaSnapshot`, never from a live rubric fetch, so it renders correctly even after the rubric is deleted. `EvalHistory` renders collapsible rows that expand into the same `EvalResult` component. One source of truth for "what an eval looks like." `Leaderboard` is the version table with a rubric filter; `RubricCard` shows criteria as chips with weight-share tooltips.

#### `app/(dashboard)/rubrics/page.tsx` and the prompt page Evals tab

The rubrics page composes list + builder + delete (with a `window.confirm` that tells the user "Past evaluations keep their snapshot", surfacing the snapshot guarantee in the UX), the prompt detail page (`app/(dashboard)/prompts/[id]/page.tsx`) grew from two tabs to four: `output | history | evals | leaderboard`. The Evals tab fetches runs with the **same query key** `["runs", id]` as the run-history tab, so the two tabs share the TanStack cache, and uses `enabled: activeTab === "evals"` so the fetch is lazy, no runs request until you open the tab.

### Schema: `prisma/schema.prisma`

Two new models (migration `20260609222443_add_rubric_evaluation`):

- `Rubric`. `criteria Json` (the `Criterion[]`), `passThreshold Float`, cascade-deleted with the user.
- `Evaluation`, the workhorse. Notable columns: `rubricId String?` with `onDelete: SetNull`; denormalized `userId` with its own index; `status` lifecycle string; nullable `totalScore`/`passed`/`criteriaScores` (null until complete); **non-nullable** `criteriaSnapshot` (every eval has one from birth); judge usage fields; `error`; `completedAt`, three indexes: `promptRunId`, `userId`, `rubricId`. Matching the three query shapes (evals for a run, all my evals, evals by rubric).

---

## 3. Key Technical Decisions

### Rubric snapshotting: historical scores must be immutable

Every Evaluation stores `criteriaSnapshot`. The full criteria array, pass threshold, and rubric name as they existed at trigger time (`app/api/runs/[runId]/eval/route.ts`). The async job scores against the snapshot, never the live rubric. The pass/fail verdict uses the snapshot's threshold.

Why this is non-negotiable: an evaluation is a **measurement**, and a measurement is only meaningful relative to the instrument that took it. If you edit a rubric (change a weight, tighten the regex, raise the threshold) and historical evals re-resolved against the live rubric, every old score would silently mean something different. The leaderboard would compare versions scored by different rules and call it a trend. Sprint 5 makes this concrete: a baseline is "version X scored S against rubric R," and regression detection computes a delta against S. If S's meaning can drift, the delta is noise. Snapshotting is the same idea as `PromptVersion` from Sprint 1, append-only history, applied to the scoring configuration. Deleting a rubric is handled the same way: `onDelete: SetNull` nulls the foreign key, but the snapshot keeps the eval fully renderable (the UI reads `criteriaSnapshot.rubricName`, not `rubric.name`).

### The pinned scoring math

`totalScore = Σ(weightᵢ × scoreᵢ) / Σ(weightᵢ)`, every criterion score in [0, 1], `passed = totalScore >= passThreshold`, the architect document literally says "pinned. Do not improvise," and the formula appears exactly once in code (`computeTotalScore` in `lib/eval/matchers.ts`), used by both the synchronous route and the async job.

Why pin it? Because there are several defensible alternatives (normalize weights to sum to 100, scores out of 10, strict `>` on the threshold, per-criterion pass requirements), and if backend and frontend, or two backend code paths. Each picked one, scores would disagree depending on which path computed them. Dividing by `Σ(weight)` rather than requiring weights to sum to anything means users can use weights 1/2/3 or 10/20/30 and get identical totals; the weight UI shows percentage *share* for exactly this reason. The `>=` (not `>`) on the threshold is also pinned, see the QA findings for the edge case it produces.

### Deterministic sync, AI-judge async

Deterministic matchers are string operations. Microseconds, no network, can't meaningfully fail. They run inline in the POST handler, and a deterministic-only rubric returns a finished eval with HTTP 200 in one round trip. The AI judge is an LLM call: seconds of latency, can time out, costs money, can be rate-limited. The CLAUDE.md convention is explicit: "Eval jobs (AI-judge) always go through QStash, never run synchronously in a request handler." Holding an HTTP request open across an LLM call ties up a serverless invocation, risks the platform's response timeout, and gives the client nothing to do but hang. Instead the route persists what it can (partial deterministic scores), returns 202 with a pending Evaluation, and the client polls. The 200-vs-202 split is HTTP semantics used correctly: 200 "here is the result," 202 "accepted, in progress."

### QStash in prod, `after()` in dev

QStash delivers jobs by HTTP POST to a public URL. It physically cannot reach `http://localhost:3000`, so in dev there is no endpoint for it to call (short of running a tunnel, which is friction for zero benefit pre-deployment). `lib/eval/queue.ts` branches: production with token + app URL configured → publish to QStash; otherwise → `after(() => runEvalJob(id))`. Next.js's `after()` schedules work to run **after the response is sent** while keeping the invocation alive. Same decoupling as a queue (respond now, work later), minus the durability (if the process dies mid-job, dev loses the job; QStash would retry). Both paths converge on the identical `runEvalJob`, so the only thing that differs between environments is transport, not logic.

### The idempotent claim: `updateMany` as compare-and-swap

QStash guarantees **at-least-once** delivery. A job may arrive twice (retry after a slow response, redelivery after a network blip). If `runEvalJob` ran twice naively, you'd pay for two judge calls and double-increment `UsageSummary`. The claim transition makes re-delivery safe:

```ts
prisma.evaluation.updateMany({
  where: { id, status: { in: ["pending", "running", "failed"] } },
  data: { status: "running" },
})
```

`updateMany` with a status condition compiles to `UPDATE .., wHERE id = ? AND status IN (...)`. A single atomic statement where the database checks the condition and applies the write under the row lock. That's a **compare-and-swap**: "transition to running only from a non-terminal state, and tell me whether you did." `count === 0` means another delivery already completed the work (or the row doesn't exist) → return without doing anything. `complete` is the only terminal no-op state; `failed` is deliberately claimable so a retry (or future manual re-trigger) can re-run a failed eval. A `findUnique` followed by an `update` would *not* be safe. Two concurrent deliveries could both read `pending` before either writes (a TOCTOU race). The single-statement form is what makes it correct. (There remains a narrow window where two deliveries both claim from `running`, see QA findings.)

### One `generateObject` call, temperature 0

All ai_judge criteria go to the judge in a single `generateObject` call (`lib/eval/judge.ts`) rather than one call per criterion, three reasons: cost (the response text, usually the longest part of the prompt. Is sent once, not N times), latency (one round trip), and **internal consistency** (the judge reads the response once and scores all criteria from the same reading, rather than N independent readings that might interpret the response differently). `temperature: 0` makes the judge as deterministic as an LLM gets. Re-evaluating the same response against the same rubric should produce (nearly) the same score, which is the reproducibility property the leaderboard and Sprint 5 baselines need. `generateObject` with a zod schema means the judge's output is structurally validated by the SDK; the code then adds its own semantic defenses (clamp, merge-by-name, score-0 for missing criteria).

### Fail-closed signature verification (503 without keys)

`/api/jobs/eval` is the one route Clerk doesn't guard, so QStash's HMAC signature is its *only* authentication. The route's first check is: no signing keys configured → **503 Service Unavailable**, refuse to execute. The tempting alternative, "no keys configured, must be dev, just run the job", is a classic fail-open vulnerability: a production deploy with a missing env var would silently become an open endpoint where anyone who guesses or enumerates evaluation IDs can trigger judge calls on your Anthropic bill. Misconfiguration must degrade to *broken*, never to *open*. (Dev doesn't suffer because dev never goes through this route at all, `after()` calls `runEvalJob` directly in-process.)

### 400, not 404, for foreign rubric IDs

In `POST /api/runs/:runId/eval`, the run gets the full 404/403 treatment (it's the resource in the URL), but a rubric that is missing **or belongs to another user** gets the same `400 "invalid rubricId"`. Returning 403 for a foreign rubric would confirm to an attacker that the ID exists and is someone else's, an existence oracle. Treating the rubric ID as just another invalid input parameter (like a malformed string) leaks nothing. The general rule: resources you address get 404/403; references you submit get 400.

### Denormalized `userId` on Evaluation

An Evaluation's owner is derivable via `promptRun.userId`, but the schema stores `userId` directly on Evaluation (with an index), and the architect comment says why: "denormalized for isolation queries." The poll endpoint runs every 2 seconds per in-flight eval and authorizes with a single `evaluation.userId !== user.id` comparison, no join, the history and leaderboard queries filter `where: { userId: user.id, ... }` as a first-class condition. This is the same trade made on `PromptRun` in Sprint 1: a little redundancy (the value never changes, so there's no update anomaly to fear) for cheaper, harder-to-get-wrong authorization on every hot path.

### `SetNull` + snapshot on rubric delete

Deleting a rubric must not delete or corrupt eval history. `Cascade` would erase every evaluation ever scored with that rubric; `Restrict` would make rubrics undeletable once used. `SetNull` plus the snapshot is the clean middle: the FK becomes null (the relation is honestly gone), and everything needed to render and re-interpret the eval lives in `criteriaSnapshot`, the UI reinforces this. The delete confirm dialog says "Past evaluations keep their snapshot," and `EvalResult` only ever reads snapshot fields.

### ReDoS mitigation: three caps

User-supplied regexes are evaluated server-side, and JavaScript's regex engine is backtracking with no timeout. A pattern like `(a+)+$` against a long non-matching input is exponential. Three independent caps bound the blast radius: pattern length ≤ 500 chars (`criteria.ts`, at write time), flags restricted to `imsu` (no exotic behavior; also validated at write time), and, the big one, the match input truncated to the first 100 KB of response text (`matchers.ts`, at eval time). None of these *prevents* a slow pattern; together they bound how slow it can get, on input the user can only hurt themselves with. The detail string honestly reports the cap: "pattern did not match (first 100 KB of response)."

### `Prisma.InputJsonValue` casts

Both rubric creation and evaluation creation write `criteria as unknown as Prisma.InputJsonValue`. `InputJsonValue` is Prisma's recursive union of JSON-representable types (`string | number | boolean | { [k]: InputJsonValue } | InputJsonValue[] ...`). `Criterion[]` does not satisfy it **structurally** because `JsonSchemaConfig` is `{ schema: Record<string, unknown> }`, and `unknown` could be a function, a Date, a circular object; TypeScript can't prove it's JSON. The values *are* JSON-safe at runtime because `validateCriteria` only admits plain objects/strings/numbers/booleans, so the double cast (`as unknown as`) is a documented, justified override of a limitation in the type system, with a comment in the code saying exactly that. The mirror-image cast appears when reading: `evaluation.criteriaSnapshot as unknown as CriteriaSnapshot`, because Prisma returns `JsonValue` and the app asserts the shape it wrote.

---

## 4. Patterns to Know

### Compare-and-swap / optimistic concurrency: `runEvalJob` claim

A single conditional `UPDATE` whose affected-row count tells you whether you won the transition. The database's row lock provides the atomicity; no application-level mutex needed. Pattern: "multiple workers might try this; exactly one should proceed." Same family as `UPDATE ... WHERE version = ?` optimistic locking.

### Snapshot isolation as a domain pattern: `criteriaSnapshot`

Not the database isolation level, the *domain* idea: copy mutable configuration into the record that depends on it, at the moment of dependence, invoices snapshot prices; orders snapshot addresses; evaluations snapshot rubrics. Pattern: "this record's meaning must not change when its inputs do."

### Webhook signature verification: `/api/jobs/eval`

HMAC over the raw request body proves the request came from the party holding the signing key, replacing session auth for machine-to-machine calls, the same pattern as the Clerk/Svix webhook from Sprint 1, read body as text first, verify, then parse, fail-closed when unconfigured.

### Queue-based load leveling: `enqueueEvalJob`

Expensive work is accepted (202), persisted (`pending` Evaluation), and executed by a separate delivery, so request latency is decoupled from work duration and a burst of eval triggers becomes a queue, not a pile-up of long-held connections.

### Polling with self-terminating `refetchInterval`: `useEval`

TanStack Query's function-form `refetchInterval` reads the latest data and returns `2000` or `false`. The poll loop's stop condition lives with the query definition, not in an effect with cleanup. Combined with `setQueryData` cache-seeding from the trigger mutation, the common case renders with zero extra requests.

### Discriminated unions for criterion configs: `types/eval.ts`

`Criterion.type` discriminates which config shape is valid, so each matcher narrows to exactly its own fields (`criterion.config as RegexConfig` after the `switch` on type). The UI counterpart is the draft/domain split in `CriterionEditor`: a permissive flat editing shape converted to the strict union only at the validation boundary.

### Denormalization for authorization: `Evaluation.userId`

Copy the owning user ID onto every row that needs per-user filtering, index it, and authorization becomes a column comparison instead of a join. Safe because ownership is immutable.

### Fail-closed defaults: judge output handling and the webhook

Missing judge score → 0, not a crash; non-finite score → 0 via `clamp01`; missing signing keys → 503, not open. When in doubt, the system degrades toward "denied/zero," never toward "allowed/passed."

---

## 5. QA Findings Worth Knowing

- **`contains` defaults to case-sensitive when the flag is omitted.** `scoreContains` only lowercases when `caseSensitive === false`; an omitted flag (`undefined`) behaves as case-sensitive. This matches JS string semantics (`includes` is case-sensitive) but could surprise an API user who assumed the opposite default. Not user-facing in practice: `draftToCriterion` in `CriterionEditor.tsx` always sends `caseSensitive` explicitly, so only hand-crafted API payloads hit the default.
- **`passThreshold: 0` with `totalScore: 0` yields `passed: true`.** The pinned math is `>=`, and `0 >= 0`. A rubric with threshold 0 passes everything including total failures. Arguably what "threshold 0" means, but worth knowing it's `>=` by contract, not an oversight, qA accepted it as pinned behavior.
- **The runs query on the prompt page routes HTTP errors to the empty state.** `runsQuery` in `app/(dashboard)/prompts/[id]/page.tsx` does `fetch(...).then((r) => r.json())` without checking `r.ok` and without an `unwrap`-style throw, so a 500 from `/api/prompts/:id/runs` parses as `{ data: null, error }`, `data?.data` is undefined, and the Evals tab shows "No runs yet" instead of an error. Cosmetic-severity; the dedicated eval hooks all use `unwrap` and handle errors properly. Worth aligning when the page is next touched.
- **A concurrent claim window exists and is accepted for now.** Two simultaneous deliveries of the *same* eval can both pass the claim if the second arrives while the first holds `running` (the claim allows `pending | running | failed` → `running`, so a redelivery during execution re-claims). Worst case: a duplicated judge call and double usage increment. With Sprint 3's manual, single-trigger flow plus QStash retrying only on failure, the window is effectively unreachable; Sprint 4's batch concurrency is when it needs a real fix (e.g., excluding `running` from the claimable set plus a staleness timeout, or a fencing token).

---

## 6. Interview Prep

After this sprint, you should be able to explain:

- **"Why does every Evaluation store a copy of the rubric?"**. Scores are measurements; the snapshot freezes the instrument. Editing a rubric must not retroactively change historical scores, leaderboard trends, or (Sprint 5) baseline deltas, same append-only philosophy as PromptVersion, applied to scoring config. Bonus: it also makes `onDelete: SetNull` safe, history survives the rubric's deletion.
- **"How do you make a queued job safe to deliver twice?"**. At-least-once delivery means design for duplicates, not against them. The first statement of `runEvalJob` is an atomic conditional `updateMany`. A compare-and-swap on the status column, and `count === 0` means the work is already done. Explain why read-then-write would race (TOCTOU) and why the single SQL statement doesn't.
- **"Why is the deterministic path synchronous but the judge path queued?"**, cost/latency/failure profile. String matching is microseconds and can't fail; an LLM call is seconds, costs money, and times out. Holding a request open across an LLM call wastes a serverless invocation and risks platform timeouts. 200 vs 202 communicates which path you got.
- **"How does the async job work in dev if QStash can't reach localhost?"**. QStash delivers by HTTP to a public URL; localhost has none. `enqueueEvalJob` branches: QStash publish in prod, Next.js `after()` in dev, same decoupling semantics, same job function, different transport and durability.
- **"How do you secure an endpoint that a queue calls but a browser shouldn't?"**: HMAC signature over the raw body, verified before parsing, with `Receiver` from `@upstash/qstash`. And fail **closed**: missing signing keys → 503. Be able to articulate why fail-open on misconfiguration is the dangerous default.
- **"Walk me through the scoring math and why it's centralized."**. Weighted mean normalized by total weight, scores in [0,1], `passed = total >= threshold`. One implementation (`computeTotalScore`) used by both the sync route and the async job, pinned in the contract so no two code paths can disagree, mention the `>=` edge case at threshold 0.
- **"Why one judge call instead of one per criterion?"**. Cost (response text sent once), latency (one round trip), and consistency (one reading of the response scores all criteria). Plus `temperature: 0` for reproducibility, `generateObject` + zod for structural validation, and defensive merging (clamp, by-name lookup, score-0 for missing) because schema validation isn't semantic trust.
- **"Why does a foreign rubric ID return 400 instead of 403?"**. 403 confirms existence, an oracle, input references (vs. addressed resources) are treated as invalid input. Contrast with the run in the same route, which does get 404/403 because it's the addressed resource.
- **"What's ReDoS and how did you mitigate it?"**. Backtracking regex engines have exponential worst cases and JS has no regex timeout. Three caps: pattern ≤ 500 chars and flags ⊆ `imsu` at write time, input truncated to 100 KB at match time, bounding, not preventing, and the detail string discloses the truncation.
- **"Why does `Criterion[]` need a cast to store as Prisma JSON?"**. `InputJsonValue` is a recursive JSON union; `Record<string, unknown>` contains `unknown`, which TypeScript can't structurally prove is JSON-safe. Runtime validation (`validateCriteria`) establishes the guarantee the type system can't, so the `as unknown as` is a justified, commented override.
- **"How does the UI know when an async eval finishes?"**, polling with TanStack Query's function-form `refetchInterval` (2s while pending/running, `false` at terminal status), cache seeded from the trigger mutation's response, and invalidation of history/leaderboard keys on terminal status. Be ready to compare with the alternatives: SSE/WebSockets (more infra, overkill for a single short-lived job) and why polling is the right v1.

---

## 7. Go Deeper

**Concurrency and idempotency**
- [Optimistic concurrency control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control). The family the `updateMany` claim belongs to
- [Idempotency keys (Stripe engineering)](https://stripe.com/blog/idempotency), the canonical writeup on designing for retried delivery
- [Prisma `updateMany`](https://www.prisma.io/docs/orm/reference/prisma-client-reference#updatemany). Why the count return value is the whole trick

**Queues and async jobs**
- [Upstash QStash docs](https://upstash.com/docs/qstash/overall/getstarted), delivery semantics, retries, signature verification with `Receiver`
- [Next.js `after()`](https://nextjs.org/docs/app/api-reference/functions/after). Post-response work in the App Router; read the caveats about execution guarantees
- [Queue-Based Load Leveling pattern (Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling), the named pattern behind 202 + queue

**Regex safety**
- [OWASP: Regular expression Denial of Service](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS). How catastrophic backtracking works, with examples
- [V8 blog: non-backtracking RegExp](https://v8.dev/blog/non-backtracking-regexp). The linear-time engine and why JS can't just use it for everything

**JSON Schema and Ajv**
- [Ajv strict mode](https://ajv.js.org/strict-mode.html). What `strict: false` relaxes and why user-supplied schemas need it
- [Understanding JSON Schema](https://json-schema.org/understanding-json-schema), the best schema-authoring reference

**LLM-as-judge**
- [Vercel AI SDK `generateObject`](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-object), structured output with zod schemas
- "Judging LLM-as-a-Judge with MT-Bench" (Zheng et al., 2023), the foundational paper on judge reliability, position bias, and self-enhancement bias; relevant when you scale judging in Sprint 4
- [Anthropic docs: using Claude as a judge / empirical eval design](https://docs.anthropic.com/en/docs/build-with-claude/develop-tests), practical guidance on rubric-style grading prompts

**TanStack Query**
- [`refetchInterval` as a function](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery), the self-terminating polling mechanism
- [`setQueryData`](https://tanstack.com/query/latest/docs/reference/QueryClient/#queryclientsetquerydata), cache seeding from mutation responses

**HTTP semantics and API design**
- [RFC 9110, 202 Accepted](https://www.rfc-editor.org/rfc/rfc9110#status.202), the official meaning of the status the eval trigger leans on
- [Microsoft REST API guidelines: long-running operations](https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md#13-long-running-operations), the 202 + polling pattern formalized
