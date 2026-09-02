# Ultros: interview prep (the whole project in one read)

Read this before a call, every section points at the deep dive it summarizes,
the per-sprint teaching docs in `docs/sprint-summary/` are the source of truth.
(Sprint 2, multi-model routing, has no teaching doc; its story is in the
Architecture section below and in the README.)

## The 30-second pitch

"Ultros is an AI evaluation platform, the LangSmith / PromptLayer category.
You write a prompt, run it against Claude, GPT, Gemini, or any OpenRouter
model, and every run is automatically scored against a rubric that mixes an
LLM judge with deterministic checks. From there you can fan a prompt out
across a dataset, A/B/C-test variants across models in a win matrix, and pin
a baseline so any new version that scores worse gets flagged, with the exact
rows that regressed, not just an average. Next.js and Postgres on Vercel,
QStash for the async fan-out, and the whole thing is gated by CI running
~90 unit tests plus 222 integration tests against a real Postgres."

## The 2-minute architecture walkthrough

Narrate one scored dataset run end to end, it touches every layer:

1. **Launch**. `POST` to the dataset-run route, server recomputes a cost
   *upper bound* (full `maxTokens` × rows) and requires `confirm: true` in
   the contract itself, checked strictly server-side. Non-UI clients get the
   same protection (sprint-4).
2. **Fan-out**, one QStash message per row, `flowControl` keyed by `userId`
   with `parallelism: 5`: all rows publish instantly, delivery is throttled
   per user so one person's 500-row batch can't starve providers or other
   tenants. In dev, the same job code runs in-process via `after()` because
   QStash can't reach localhost (sprint-3/4).
3. **Row job**, calls the model through `lib/ai`, routing rule: Anthropic /
   OpenAI / Google go **direct** (prompt caching and batch pricing only exist
   direct); OpenRouter serves the long-tail catalog where breadth beats
   per-token economics. A failed row still persists a `PromptRun` with
   `finishReason: "error"`. Failure is a kind of result, which keeps
   completion counting, drill-down, and export on one query shape.
4. **Scoring**. Deterministic matchers run synchronously (microseconds,
   can't fail); the AI-judge path is one `generateObject` call at
   `temperature: 0` scoring all criteria at once, wrapped in the leased
   idempotent claim (see war story #1). Every `Evaluation` stores a snapshot
   of the rubric. Editing a rubric must never rewrite historical scores.
5. **Fan-in**, `finalizeIfDone` gates on `COUNT` of persisted rows (ground
   truth, never counters) and **recomputes** mean / variance / pass rate /
   cost from rows. A pure function of DB state converges no matter how many
   workers race it.
6. **UI**, TanStack Query polling with a self-terminating `refetchInterval`
   (2s while running, `false` at terminal status).

Then land the two design spines:

- **One batch primitive.** An experiment cell IS a `DatasetRun`; a regression
  run IS a `DatasetRun`. Sprints 5's features reused sprint 4's fan-out,
  idempotency, and finalize machinery without modification, one idempotency
  story instead of three (sprint-5).
- **Measurements are frozen.** Rubric snapshots on evaluations (copy),
  immutable datasets with 409-on-delete (freeze), append-only prompt
  versions. Copy when small, freeze when copying is prohibitive (sprint-4).

## War stories, ranked: lead with #1

1. **The double-judge race** (sprint-7). QStash is at-least-once; the job's
   claim was an atomic `updateMany`, but `running` was in the claimable set.
   Under READ COMMITTED, the second delivery blocks on the row lock, then
   *re-evaluates the WHERE against the committed value*, sees `running`,
   still claimable, claims too. Double LLM call, double billing. Fix: a
   **leased claim**. `startedAt` timestamp, fresh `running` rows match no
   branch, stale ones (lease lapsed) stay reclaimable, so idempotency and
   crash recovery come from one column. Why not an advisory lock: never hold
   a DB lock across a multi-second LLM call. Proven by an integration test
   firing two simultaneous deliveries. Follow-up shipped: QStash
   `failureCallback` → exhausted retries mark the eval failed and finalize
   the batch instead of wedging it forever.
2. **Wedge-proof batches** (sprint-4). Enumerate how async batches get stuck
   and the answer to each: crash between persist and increment → gate on
   persisted-row COUNT, not counters; last eval *fails* → the failure path
   also calls finalize; two finishers race → recompute is idempotent, both
   write the same numbers. "Increments are only correct under exactly-once,
   which nobody has."
3. **Honest statistics** (sprint-5). The win matrix reports descriptive
   deltas with an under-sampled badge, deliberately **no p-values**: small n,
   rows aren't IID, judge noise is correlated. A t-test would fake rigor.
   Plus the IEEE-754 story: a drop of exactly the threshold must not flag,
   so threshold comparisons carry an epsilon (`0.8 - 0.75 !== 0.05`).
4. **Security posture** (sprint-3/6/7). A foreign rubric ID returns 400, not
   403. 403 confirms existence, an oracle; share links return
   capability-hiding 404s. ReDoS bounded three ways (pattern length, flag
   allowlist, 100 KB input cap). CSV export guards formula injection
   (`= + - @` prefixed). QStash webhook fails **closed**, missing signing
   keys → 503. Share tokens stored plain vs passwords hashed: capability vs
   credential. Every error path collapses through `toErrorResponse` so a raw
   driver error (which can carry a connection string) never reaches a client.
5. **The test spine** (sprint-7). Pure decisions factored away from IO so
   ~90 unit tests cover matchers/stats/compare exhaustively; 222 integration
   tests import route handlers directly against a disposable Postgres (only
   Clerk's `auth()` mocked. Isolation and Prisma run for real; the harness
   refuses non-localhost hosts because it truncates tables). CI coverage is a
   **ratchet**, the floor only rises. CI's token has `contents: read` only.

## Questions to expect, and honest answers

- **"How is this different from LangSmith?"** Same category, portfolio
  scale, don't claim parity. The distinctive piece is regression testing
  with row-level evidence: not "score dropped 0.05" but *these rows flipped*.
- **"How do you know the AI judge is reliable?"** Concede it. Judge noise is
  real and it's why the design hedges: rubrics mix deterministic matchers
  with the judge, one judge call scores all criteria consistently at
  `temperature: 0` with zod-validated structured output, regression uses
  thresholds + epsilon rather than raw comparison, and the judge model is
  swappable (`JUDGE_MODEL`, Haiku default). What you'd add next: a
  human-labeled calibration set to measure judge agreement.
- **"What would you do differently?"** Have real ones ready: the
  `findFirst`-then-create idempotency check has a residual race a unique
  constraint would close (documented in sprint-4); polling → SSE if runs got
  long-lived; budget enforcement is a UX gate, not a server lockout, the
  line you'd move for a multi-tenant billing product (sprint-6).
- **"What actually broke during the build?"** `/docs` was blocked by auth
  middleware in prod only (dev/prod allowlist asymmetry, human auth vs
  machine auth colliding); turning on lint in CI failed on a clean checkout
  (ESLint walking agent worktrees and a vendored mockup). Real answers beat
  polished ones.

## The build-process story (use it: it's a differentiator)

This was built by directing a six-role agent workflow: an architect writes
the API contract first; backend and frontend build **to the contract**, never
by reading each other's code; adversarial security and QA agents review
before every sprint commit and must write findings files *before* any fix
lands; a teaching agent documents each sprint so the docs can't drift. The
repo is the evidence, architect contracts, security and QA reports, and
teaching write-ups per sprint are all committed.

Frame it as engineering management of AI, not autocomplete: you set contracts,
reviewed everything, and shipped scoped commits, and you can defend any line
of it (that's what the sprint docs and this file are for). Never imply you
hand-typed it; the credibility is the review discipline plus the depth of
understanding, which is exactly the skill the industry is hiring for now.

## Numbers to have loaded

- 7 sprints; ~35 API route files; 222 integration tests + ~90 unit tests;
  3 parallel CI jobs (quality, migrations-vs-fresh-Postgres, build).
- Batch: 500-row dataset cap, per-user parallelism 5, 5-minute eval lease.
- Error envelope rollout: ~250 hand-rolled error sites replaced via a
  status→code codemod, frontend migrated in lockstep.
- Stack in one breath: Next.js App Router + Clerk + Prisma/Supabase +
  Vercel AI SDK (3 direct providers + OpenRouter) + Upstash QStash/Redis +
  Sentry, deployed on Vercel.
