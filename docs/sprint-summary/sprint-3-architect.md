# Sprint 3 — Evaluation Engine — Architect Plan

Status: APPROVED contract. Backend and Frontend build to this document; neither inspects the other's code to understand the API.

This plan incorporates the pre-sprint review decisions (2026-06-09):
criterion `config` payloads, pinned scoring math, Evaluation status lifecycle,
rubric snapshotting, dev-mode queue fallback, QStash signature verification,
job idempotency, ReDoS caps, full rubric CRUD, narrow leaderboard scope, and
manual eval trigger (true auto-scoring arrives with Sprint 4 dataset runs).

## Requirements

Done when: a run can be scored against a rubric with both deterministic and
AI-judge methods, the score is reproducible, and history + leaderboard render.

1. Rubric CRUD — criteria with weights, type-specific config, pass threshold.
2. Deterministic matchers run synchronously in the request: exact, regex,
   json_schema, contains.
3. AI-as-judge runs asynchronously: QStash in prod, in-process `after()`
   fallback in dev (QStash cannot reach localhost; deployment is Sprint 6).
4. Every Evaluation snapshots the rubric criteria at eval time — editing a
   rubric never changes the meaning of historical scores (Sprint 5 baselines
   depend on this).
5. Judge token usage and cost are recorded on the Evaluation and rolled into
   UsageSummary (tokens + cost only, not totalRuns).
6. Eval history per prompt and a version leaderboard (avg score per prompt
   version, optionally filtered by rubric).

## Scoring math (pinned — do not improvise)

- Every criterion produces a score in **[0, 1]**. Deterministic matchers
  produce exactly 0 or 1. The judge returns a float in [0, 1] per criterion.
- `totalScore = Σ(weightᵢ × scoreᵢ) / Σ(weightᵢ)` — weighted mean, also in [0, 1].
- `passed = totalScore >= passThreshold` (passThreshold in [0, 1]).
- Judge: **one** `generateObject` call covering all ai_judge criteria
  (cheaper, internally consistent), `temperature: 0`, default model
  `claude-haiku-4-5` (overridable via `JUDGE_MODEL` env; must pass
  `isModelAvailable`). Judge cost computed with `lib/ai/pricing.ts`.

## Criterion spec (shared contract — see `types/eval.ts`, written by architect)

```ts
type CriterionType = "ai_judge" | "exact" | "regex" | "json_schema" | "contains"

type Criterion = {
  name: string        // 1–100 chars, unique within rubric
  type: CriterionType
  weight: number      // > 0 and <= 100
  config:
    | { instructions: string }                              // ai_judge, 1–2000 chars
    | { expected: string; caseSensitive?: boolean; trim?: boolean }  // exact
    | { pattern: string; flags?: string }                   // regex
    | { schema: Record<string, unknown> }                   // json_schema
    | { substring: string; caseSensitive?: boolean }        // contains
}
```

Validation limits (server-side, return 400):
- ≤ 20 criteria per rubric; ≥ 1 criterion.
- regex: pattern ≤ 500 chars; flags restricted to subset of `imsu`; compile in
  try/catch; match against at most the first **100 KB** of response text
  (ReDoS mitigation — JS regex has no timeout).
- json_schema: serialized schema ≤ 10 KB; validated with Ajv (`strict: false`);
  the run's responseText must parse as JSON or the criterion scores 0.
- exact/contains: expected/substring 1–10000 chars.
- ai_judge instructions: 1–2000 chars.

## DB changes (prisma/schema.prisma + migration)

```prisma
model Rubric {
  id            String       @id @default(cuid())
  userId        String
  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  name          String
  description   String?
  criteria      Json         // Criterion[]
  passThreshold Float        // 0–1
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  evaluations   Evaluation[]

  @@index([userId])
}

model Evaluation {
  id                String    @id @default(cuid())
  promptRunId       String
  promptRun         PromptRun @relation(fields: [promptRunId], references: [id], onDelete: Cascade)
  rubricId          String?
  rubric            Rubric?   @relation(fields: [rubricId], references: [id], onDelete: SetNull)
  userId            String    // denormalized for isolation queries
  status            String    // "pending" | "running" | "complete" | "failed"
  totalScore        Float?
  passed            Boolean?
  criteriaScores    Json?     // CriterionScore[]
  criteriaSnapshot  Json      // { criteria: Criterion[], passThreshold: number, rubricName: string }
  aiEvalReasoning   String?
  evalMethod        String    // "deterministic" | "ai_judge" | "mixed"
  judgeModel        String?
  judgeInputTokens  Int?
  judgeOutputTokens Int?
  judgeCostUsd      Float?
  error             String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  completedAt       DateTime?

  @@index([promptRunId])
  @@index([userId])
  @@index([rubricId])
}
```

Add back-relations: `User.rubrics Rubric[]`, `User` ← Evaluation via userId is
plain column (no relation needed), `PromptRun.evaluations Evaluation[]`.
Rubric deletion: `SetNull` on Evaluation — history survives via snapshot.

## New files / services

```
lib/eval/criteria.ts     # Criterion + rubric validation (shared by rubric CRUD and eval)
lib/eval/matchers.ts     # exact/regex/json_schema/contains → 0|1 + detail string
lib/eval/judge.ts        # generateObject judge call (zod schema), default model, cost calc
lib/eval/runEvalJob.ts   # async job body: claim → judge → merge → complete/fail (idempotent)
lib/eval/queue.ts        # enqueueEvalJob(): QStash publish in prod, after() in dev
types/eval.ts            # shared DTO/criterion types (WRITTEN BY ARCHITECT — do not redefine)
app/api/rubrics/route.ts                 # GET list, POST create
app/api/rubrics/[id]/route.ts            # GET, PATCH, DELETE
app/api/runs/[runId]/eval/route.ts       # POST trigger eval
app/api/evals/[id]/route.ts              # GET poll status/result
app/api/prompts/[id]/evals/route.ts      # GET eval history
app/api/prompts/[id]/leaderboard/route.ts # GET version leaderboard
app/api/jobs/eval/route.ts               # QStash webhook (signature-verified)
components/eval/RubricBuilder.tsx, RubricCard.tsx, CriterionEditor.tsx,
components/eval/EvalResult.tsx, EvalHistory.tsx, Leaderboard.tsx, EvalTrigger.tsx
hooks/useRubrics.ts, hooks/useEval.ts, hooks/useEvalHistory.ts, hooks/useLeaderboard.ts
app/(dashboard)/rubrics/page.tsx
```

New deps: `zod`, `ajv`, `@upstash/qstash`.
New env (all optional in dev): `UPSTASH_QSTASH_TOKEN`,
`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `JUDGE_MODEL`.

## Eval flow

`POST /api/runs/:runId/eval` (auth required):
1. Load run scoped to user (404/403 per conventions); load rubric scoped to user.
2. Create Evaluation with `criteriaSnapshot`, `evalMethod`
   (`deterministic` if no ai_judge criteria, `ai_judge` if only ai_judge,
   else `mixed`), status `pending`.
3. Run deterministic criteria synchronously; store partial `criteriaScores`.
4. No ai_judge criteria → compute totalScore/passed, status `complete`,
   `completedAt`, return the finished eval (HTTP 200).
5. Otherwise enqueue job and return the pending eval (HTTP 202).

Job (`runEvalJob(evaluationId)`):
1. **Claim**: `updateMany({ where: { id, status: { in: ["pending", "running", "failed"] } }, data: { status: "running" } })`
   — count 0 means complete (terminal) → no-op. This makes QStash retries
   idempotent; `complete` is the only terminal no-op state.
2. Judge call for all ai_judge criteria in one generateObject; merge with
   stored deterministic scores; compute totals; set `complete` + judge
   usage fields; increment UsageSummary **tokens and cost only**.
3. On error: status `failed`, `error` message (never include API keys).

`/api/jobs/eval`: verifies QStash signature with `Receiver` from
`@upstash/qstash` (401 on failure); body `{ evaluationId }`. In dev
(no QStash env), `enqueueEvalJob` calls `after(() => runEvalJob(id))`
directly — no HTTP hop, no tunnel needed.

## API contract (request/response examples)

All responses use `{ data, error }`. All routes Clerk-authed except none.

`POST /api/rubrics`
```json
req:  { "name": "Support reply quality", "description": null, "passThreshold": 0.7,
        "criteria": [
          { "name": "mentions refund", "type": "contains", "weight": 1,
            "config": { "substring": "refund", "caseSensitive": false } },
          { "name": "politeness", "type": "ai_judge", "weight": 2,
            "config": { "instructions": "Score 1 if the reply is polite and empathetic, 0 if rude." } } ] }
res 201: { "data": { "id": "rub_x", "name": "...", "criteria": [...], "passThreshold": 0.7,
           "createdAt": "...", "updatedAt": "..." }, "error": null }
res 400: { "data": null, "error": "criteria[0].config.pattern: invalid regex" }
```

`GET /api/rubrics` → `{ data: Rubric[], error: null }` (user's only, newest first).
`GET /api/rubrics/:id` → 200 / 404 / 403.
`PATCH /api/rubrics/:id` — same body/validation as POST (partial allowed for
name/description/passThreshold; criteria replaced wholesale if present).
`DELETE /api/rubrics/:id` → `{ data: { id }, error: null }`; evals keep snapshots.

`POST /api/runs/:runId/eval`
```json
req:  { "rubricId": "rub_x" }
res 200 (deterministic-only): { "data": { "id": "ev_1", "status": "complete",
        "totalScore": 1.0, "passed": true,
        "criteriaScores": [ { "name": "mentions refund", "type": "contains",
          "weight": 1, "score": 1, "detail": "substring found" } ],
        "evalMethod": "deterministic", ... }, "error": null }
res 202 (has ai_judge): { "data": { "id": "ev_2", "status": "pending", ... }, "error": null }
res 404: run not found; 403: another user's run; 400: invalid rubricId.
```

`GET /api/evals/:id` → full Evaluation incl. status (client polls this while
pending/running). 404/403 per conventions.

`GET /api/prompts/:id/evals?limit=50` → newest-first Evaluations for the
prompt's runs, each with `{ run: { id, model, createdAt, promptVersionId,
versionNumber } }` joined in.

`GET /api/prompts/:id/leaderboard?rubricId=optional`
```json
res: { "data": [ { "promptVersionId": "v2", "versionNumber": 2, "label": "tighter tone",
       "avgScore": 0.84, "passRate": 0.9, "evalCount": 10 } ], "error": null }
```
Computed from **complete** evaluations only, sorted by avgScore desc.

`POST /api/jobs/eval` — QStash only, signature-verified, not for browsers.

## Frontend behavior

- `/rubrics`: library list + builder. CriterionEditor switches config fields by
  type. Client-side validation mirrors server limits. Loading/error/empty
  states mandatory (per CLAUDE.md) on every data-fetching component.
- Prompt detail page: each run row gets an Evaluate control (rubric picker →
  POST). Pending/running evals poll `GET /api/evals/:id` via TanStack Query
  `refetchInterval: 2000`, stopping on complete/failed. EvalResult shows
  total score, pass/fail badge, per-criterion table, judge reasoning, judge cost.
- Leaderboard + history render on the prompt page (tabs or sections).
- Tailwind + shadcn-style components only; Recharts if any chart (not required
  this sprint); Zustand only if local UI state demands it (builder form state
  can be plain useState).

## Risks / security notes

- `/api/jobs/eval` is the only unauthenticated-by-Clerk route — QStash
  signature verification is mandatory; without configured signing keys the
  route must 503, never run open.
- User-supplied regex is a ReDoS vector — enforce the caps above.
- Judge errors must not leak provider API keys into `error`.
- All rubric/eval queries scoped by userId (Evaluation.userId is denormalized
  for exactly this).
- QStash retries → idempotent claim transition (above).
- `.bin` shims are broken on this volume — invoke tools as
  `node node_modules/typescript/bin/tsc`, `node node_modules/prisma/build/index.js`,
  `node node_modules/eslint/bin/eslint.js`, `node node_modules/next/dist/bin/next`.

## Success criteria

1. Create rubric mixing deterministic + ai_judge criteria → evaluate a run →
   202 → poll → complete with merged scores, correct weighted total, judge
   cost recorded, UsageSummary tokens/cost incremented.
2. Deterministic-only rubric → synchronous 200 complete.
3. Editing a rubric after an eval does not change the stored eval's
   snapshot/scores; deleting it leaves history readable.
4. Invalid criteria rejected with 400 + field-specific message.
5. Another user's run/rubric → 403; unauthenticated → 401.
6. `tsc --noEmit` clean; `next build` passes; no console.log.
