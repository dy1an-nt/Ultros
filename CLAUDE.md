@AGENTS.md

# Ultros

AI evaluation and prompt experimentation platform. Developers test prompts against multiple models, run them across datasets, score outputs automatically (AI-as-judge + rubrics), and catch performance regressions between prompt versions. Every run is a first-class, scored, tracked experiment.

**Positioning:** Not a prompt-sharing community. An AI evaluation platform — think LangSmith / HumanLoop / PromptLayer. Pairs with RestaurantIQ in the portfolio to demonstrate both traditional full-stack SaaS and modern AI infrastructure engineering.

## Operating Rules (lead session)

This project runs on a usage-limited plan, and the lead session may be any Claude model (Opus is the usual). These rules define how the lead operates — follow them over default habits.

**Act, don't ask.** When you have enough information to proceed, proceed. Reversible actions that follow from the request need no permission — asking "Should I…?" burns a round trip. Stop for exactly two things: destructive or outward-facing operations (data loss, force-push, deploys, publishing) and genuine scope changes. Never end a turn on a plan, an options list, or a promise ("I'll do X next") — do X, then end the turn. When a tool or command errors, read the error, adapt, and retry; don't hand the problem back to the user.

**A question is not a change request.** When the user asks a question or describes a problem, the deliverable is your analysis — report findings and stop; fix only when asked. When they ask for a change, the turn isn't over until it's built, verified, and reported.

**Decide once.** Don't re-derive facts already established in the conversation or re-open decisions the user already made. When a real choice appears, give one recommendation with the reason — not a survey of options you won't take.

**Lead with the outcome.** The first sentence of the final message answers "what happened / what did you find"; supporting detail comes after, and everything the user needs is in that final message. Write complete sentences — no arrow-chain fragments ("A → B → fails"), no invented shorthand the reader must decode, no section headers on a simple answer. Report failures verbatim (real test output, real error text) — never "should work now".

**Verify before reporting.** After a nontrivial change, run the narrowest real check: `npm run typecheck`, the targeted vitest file, `npm run test:integration` when routes changed. Before any state-changing command (restart, delete, config rewrite), confirm the evidence supports that specific action — a symptom that pattern-matches a known failure can have a different cause.

**Spend tokens like they're yours — they are.** Batch independent tool calls into a single block. Read the slice of a file you need, not the whole file. Don't re-read a file you just edited to "check" it — a failed edit errors loudly. Don't spawn a subagent for work you can do inline: every spawn starts cold and re-buys context you already have.

**Code reads native.** Match the surrounding file's idiom, naming, and comment density. A comment states a constraint the code can't show — never what changed, what the next line does, or why the change is correct.

## Project Overview

**Core features (in sprint order):**
1. Prompt editor with streaming, versioning, and system prompt builder
2. Multi-model platform — Claude, GPT, Gemini direct + OpenRouter for long-tail models
3. Evaluation engine — AI-as-judge + deterministic rubric scoring, every run auto-scored
4. Dataset testing — upload CSV/JSON, run prompt across all rows, aggregate metrics
5. Experiments & regression testing — A/B/C variant comparison + baseline regression detection
6. Share-via-link, rate limiting, budget alerts, production deployment

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Client state | Zustand |
| Server state | TanStack Query |
| Editor | CodeMirror 6 |
| Charts | Recharts |
| Auth | Clerk (JWT, OAuth, magic link) |
| ORM | Prisma |
| Database | PostgreSQL via Supabase |
| AI abstraction | Vercel AI SDK (unified streaming) |
| AI providers (direct) | Anthropic Claude, OpenAI GPT, Google Gemini |
| AI aggregator | OpenRouter (long-tail models, ~5% markup) |
| Caching / rate limiting | Upstash Redis |
| Async job queue | Upstash QStash |
| Hosting | Vercel (frontend + API routes) |
| File storage | Supabase Storage |
| Monitoring | Sentry + Vercel Analytics |

**AI routing rule:** cost-optimized defaults + caching/batch paths go DIRECT to providers (prompt caching and batch API only work direct); OpenRouter handles the long-tail/experimental catalog where breadth > per-token savings.

## Database Schema (Prisma models)

```
User            id, clerkId, username, avatarUrl, createdAt

Prompt          id, userId, title, description, tags[], createdAt, updatedAt

PromptVersion   id, promptId, versionNumber, label, systemPrompt,
                userPrompt, variables{}, createdAt

PromptRun       id, promptVersionId, userId, datasetRowId (nullable),
                experimentId (nullable), model, provider,
                temperature, maxTokens, inputTokens, outputTokens,
                latencyMs, costUsd, responseText, finishReason, createdAt

Rubric          id, userId, name,
                criteria[] (name, weight, type: ai_judge|exact|regex|json_schema|contains),
                passThreshold, createdAt

Evaluation      id, promptRunId, rubricId, totalScore, passed (bool),
                criteriaScores{}, aiEvalReasoning, evalMethod, createdAt

Dataset         id, userId, name, description, rowCount, columns[], createdAt

DatasetRow      id, datasetId, rowIndex, data{} (column → value),
                expectedOutput (nullable)

Experiment      id, userId, name, datasetId, rubricId,
                variantVersionIds[], models[],
                status (pending|running|complete), createdAt, completedAt

ExperimentResult  id, experimentId, promptVersionId, model,
                  avgScore, scoreVariance, avgLatencyMs,
                  totalCostUsd, passRate, createdAt

Baseline        id, promptId, promptVersionId, datasetId, rubricId,
                baselineScore, baselinePassRate, setAt

RegressionRun   id, baselineId, newVersionId, newScore, scoreDelta,
                regressed (bool), regressedRowIds[], createdAt

UsageSummary    id, userId, date, totalRuns, totalInputTokens,
                totalOutputTokens, totalCostUsd
```

## API Routes

```
POST /api/webhooks/clerk                  — sync user to DB on sign-up

GET  /api/prompts                         — list user's prompts
POST /api/prompts                         — create prompt
GET  /api/prompts/:id                     — get prompt with versions
PATCH /api/prompts/:id                    — update metadata
DELETE /api/prompts/:id                   — soft delete

POST /api/prompts/:id/versions            — save new version
GET  /api/prompts/:id/versions            — list versions
GET  /api/prompts/:id/versions/:versionId — get single version

POST /api/run                             — execute prompt, stream response
GET  /api/prompts/:id/runs               — run history

POST /api/runs/:runId/eval               — score a run (queued if AI-judge)
GET  /api/rubrics                         — list user rubrics
POST /api/rubrics                         — create rubric
GET  /api/prompts/:id/evals              — eval history

GET  /api/datasets                        — list datasets
POST /api/datasets                        — upload/create (CSV/JSON parse)
GET  /api/datasets/:id                    — dataset + rows
DELETE /api/datasets/:id

POST /api/experiments                     — create + launch (queued)
GET  /api/experiments/:id                — status + aggregate results
GET  /api/experiments/:id/results        — per-variant/model breakdown
GET  /api/experiments/:id/rows           — per-row drill-down

POST /api/prompts/:id/baseline           — set baseline (version + dataset + rubric)
POST /api/prompts/:id/regression         — run against baseline, detect regressions
GET  /api/prompts/:id/regression/history — score-over-time

POST /api/share                           — create read-only public link
GET  /api/share/:token                    — public view (no auth)

GET  /api/usage                           — user usage stats
GET  /api/usage/export                    — CSV export
```

## App Pages

```
/                          → Landing page
/sign-in                   → Clerk auth
/sign-up                   → Clerk auth
/dashboard                 → Home (recent prompts, experiments, usage summary)
/prompts                   → Prompt library
/prompts/new               → Create prompt
/prompts/:id               → Prompt detail (editor + runs + evals + versions)
/prompts/:id/compare       → Model comparison (side-by-side, up to 3 models)
/prompts/:id/regression    → Regression testing (baseline vs versions, score-over-time)
/datasets                  → Dataset library
/datasets/:id              → Dataset detail + rows
/experiments               → Experiment list
/experiments/new           → Configure (variants × dataset × models × rubric)
/experiments/:id           → Results (win matrix, per-criterion, drill-down)
/rubrics                   → Rubric library + builder
/usage                     → Usage dashboard
/settings                  → Account, API keys, budget preferences
/share/:token              → Read-only public view (no auth)
/docs                      → Public product docs (no auth)
```

## Folder Structure

```
ultros/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # sign-in, sign-up
│   ├── (dashboard)/            # protected routes
│   │   ├── dashboard/
│   │   ├── prompts/
│   │   ├── datasets/
│   │   ├── experiments/
│   │   ├── rubrics/
│   │   ├── usage/
│   │   └── settings/
│   ├── share/                  # public read-only views
│   ├── api/                    # API routes
│   └── layout.tsx
├── components/
│   ├── editor/                 # CodeMirror prompt editor
│   ├── compare/                # Side-by-side model comparison
│   ├── eval/                   # Rubric builder, scoring UI, eval results
│   ├── datasets/               # Dataset upload, row viewer
│   ├── experiments/            # Experiment config, win matrix, drill-down
│   ├── regression/             # Baseline UI, regression detection, score chart
│   ├── usage/                  # Cost charts, usage breakdown
│   └── ui/                     # shadcn/ui base components
├── lib/
│   ├── ai/                     # Vercel AI SDK wrappers — direct providers + OpenRouter
│   │   └── pricing.ts          # Token cost constants per model (verified date in comment)
│   ├── api/                    # Error envelope helpers (ApiError, errorResponse, jsonOk)
│   ├── eval/                   # Scoring engine: AI-judge + exact/regex/json/contains
│   ├── experiments/            # Experiment runner, aggregation, statistics
│   ├── jobs/                   # QStash job publishers/consumers
│   ├── regression/             # Baseline comparison, regression detection
│   ├── prisma.ts               # Prisma client singleton
│   ├── logger.ts               # Structured JSON logger (secret-scrubbed) — use instead of console
│   ├── rateLimit.ts            # Upstash Redis rate limiting
│   └── auth.ts                 # Clerk helpers
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── store/                      # Zustand stores
├── hooks/                      # Custom React hooks
├── types/                      # Shared TypeScript types
├── docs/
│   └── sprint-summary/         # sprint-N.md agent summaries
├── .env.local
├── next.config.ts
└── package.json
```

## Build Sprints

**Sprint 1 — Foundation**
Done when: write a prompt, hit Claude, see a saved run in the DB.
- Next.js scaffolding (TypeScript + Tailwind + shadcn/ui)
- Clerk auth (sign up, sign in, protected routes)
- Prisma schema + Supabase connection
- Prompt editor UI (CodeMirror 6) + system prompt builder
- Single-model streaming run endpoint (Claude first)
- Save prompt + run to DB
- Prompt versioning (save, list, diff, restore)

**Sprint 2 — Multi-Model Platform**
Done when: run any prompt against Claude, GPT, Gemini, or OpenRouter models with full cost tracking.
- `lib/ai/` hybrid layer: direct providers + OpenRouter behind one interface
- GPT + Gemini direct via Vercel AI SDK; OpenRouter for extended catalog
- Model comparison (side-by-side, 3 models, sync send)
- Token + cost tracking per run; usage dashboard

**Sprint 3 — Evaluation Engine**
Done when: every run is automatically scored against a rubric with both AI-judge and deterministic methods.
- Rubric builder (criteria, weights, pass thresholds)
- AI-as-judge scoring (judge model via QStash)
- Deterministic matchers (exact, regex, JSON schema, contains)
- Eval history + scoring leaderboard
- *Get the eval signal stable here — regression testing builds on it.*

**Sprint 4 — Dataset Testing**
Done when: upload a dataset and run a prompt across all rows with aggregate metrics.
- Dataset upload + parse (CSV/JSON)
- Variable mapping (`{{vars}}` → dataset columns)
- Batch run across dataset × models (queued)
- Aggregate metrics: avg score, variance, latency, cost; per-row drill-down + export

**Sprint 5 — Experiments & Regression Testing**
Done when: A/B/C test prompt variants statistically AND detect regressions against a baseline.
- Prompt experiments: variants × dataset × rubric, win matrix, per-criterion stats
- Baselines: pin a version + dataset + rubric
- Regression detection: re-run baseline, compute delta, flag regressions
- Score-over-time / performance tracking charts

**Sprint 6 — Polish & Launch**
Done when: live in production.
- Landing page (positioned as AI evaluation platform)
- Share-via-link (read-only public views)
- Sentry + Vercel Analytics; rate limiting via Upstash Redis
- Budget alerts + CSV export; README + demo video

**Sprint 7 — Testing & Reliability**
Done when: CI gates every push; routes are covered by integration tests; errors follow one envelope.
- Vitest unit suite over the pure core (`lib/eval`, `lib/experiments`, `lib/regression`) — done
- GitHub Actions CI: lint + typecheck + test, migration check vs fresh Postgres, build — done
- QStash idempotency fix (leased claim on `Evaluation.startedAt`) — done
- Route-level integration suites against local Postgres (`npm run test:integration`) — done, all user-facing routes covered
- Structured error envelope `{ code, message }` across every route, in lockstep with frontend `json.error?.message` reads — done

## Environment Variables

```env
# Supabase
DATABASE_URL=
DIRECT_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# AI Providers (direct)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=

# AI Aggregator
OPENROUTER_API_KEY=

# Local inference (dev only — leave unset in production; Vercel cannot reach localhost)
# Setting this makes Ollama-hosted models (qwen3:8b) appear in the catalog.
OLLAMA_BASE_URL=

# Eval judge model (optional; defaults to claude-haiku-4-5).
# JUDGE_MODEL=qwen3:8b runs ai_judge evals free on local Ollama — weaker/noisier
# scoring than Haiku, so keep the default when judge consistency matters.
JUDGE_MODEL=

# Upstash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
UPSTASH_QSTASH_TOKEN=

# App
NEXT_PUBLIC_APP_URL=
```

## Agent Team System

Six specialized roles per sprint, each owning a clear vertical slice. **Default: the lead plays every role itself, inline, in workflow order** — on a usage-limited plan, subagent spawns are the expensive path (each starts cold and re-buys context the lead already has). The roles also exist as subagents in `.claude/agents/` (backend-agent, frontend-agent, security-agent, qa-agent, teaching-agent; each pinned to `model: sonnet`) for when the user asks for agents, or when the backend and frontend slices are both big enough that parallel building beats two cold starts. Inline or spawned, every role's mandatory output is identical and required.

### Agent Roles

**Architect Agent** (`claude` / lead)
- Goal format: "We are building [feature]. Produce the sprint plan: requirements, DB changes, API contract, edge cases, auth/isolation risks, scaling concerns, and success criteria."
- Owns: sprint design, API contract definition, risk identification
- Runs FIRST — backend and frontend must not start until architect output is written
- Mandatory output: requirements, DB changes (if any), new files/services, full API contract with request/response examples, risks, success criteria

**Backend Agent** (`backend-agent`)
- Goal format: "Build [endpoint/service] per the architect contract. Accept [inputs], return [outputs]."
- Owns: Next.js API routes, Prisma queries, Clerk middleware, AI provider wrappers (`lib/ai/`), QStash jobs
- Coordination: the architect contract IS the API contract. Backend posts only *deviations* from it (files changed, any request/response shape that differs, new error cases) — frontend must never inspect backend code to understand the API
- Mandatory output: files changed, DB changes, deviations from the architect contract (or "built to contract, no deviations")

**Frontend Agent** (`frontend-agent`)
- Goal format: "Build [feature/component] that does [behavior]. User should be able to [interaction]."
- Owns: Next.js pages, React components, Tailwind + shadcn/ui, Recharts visualizations, Zustand stores, TanStack Query hooks
- Coordination: builds against the architect contract from the start; reconciles with any deviations backend posts
- Must handle: loading state, error state, empty state for every data-fetching component

**Security Agent** (`security-agent`)
- Goal format: "Security review the [feature] backend routes. Check auth, user isolation, input validation, secrets handling, and common attacks."
- Owns: adversarial review — not "does it work" but "how could it be abused"
- Runs after backend + frontend finish, before functional QA — and BEFORE the sprint commit lands
- Mandatory output: `docs/sprint-summary/sprint-N-security.md` — what was checked, findings (severity + file:line), what was waived and why. Read-only: reports findings, never applies fixes itself
- Checklist:
  - Clerk JWT verification on every protected route
  - Every DB query scoped to `userId` (no cross-user data leakage)
  - No API keys or tokens in logs or responses
  - Input validated at API boundaries (especially dataset upload, rubric criteria)
  - SQL injection (raw query), XSS (shared links), CSRF, authorization bypass surface checked
  - OpenRouter API key never exposed to the client

**QA Agent** (`qa-agent`)
- Goal format: "Verify [feature] end to end. Test happy path, invalid input, unauthorized user, wrong user's data, empty dataset, large dataset."
- Owns: functional correctness, integration, schema mismatches, error + empty states
- Runs after Security Agent clears — and BEFORE the sprint commit lands
- Test cases required: happy path, invalid input, unauthorized user, wrong user's data, empty data, edge-case data (large dataset, 0-score rubric, 100% pass rate)
- Mandatory output: `docs/sprint-summary/sprint-N-qa.md` — cases exercised, pass/fail per case, defects found (with repro). Read-only: reports defects, never applies fixes itself

**Teaching Agent** (`teaching-agent`)
- Goal format: "After all agents finish, summarize the sprint. Explain it like I'm a CS student who wants to understand it deeply."
- Owns: `docs/sprint-summary/sprint-N.md` — one file per sprint
- Also owns: updating any CLAUDE.md section (conventions, folder structure, sprint list) the sprint changed — the doc must not drift from the code
- Waits for: QA Agent sign-off before writing
- Produces, for each sprint:
  - What each file does and why it exists
  - Key technical decisions and why they were made that way
  - Patterns or concepts used (e.g. "this uses the repository pattern because…")
  - What you should be able to explain in an interview about this sprint's work
  - What to look up if you want to go deeper

### Sprint Workflow

Inline by default: one lead session, switching roles in this order and producing every artifact. Role discipline while inline: during the security and QA steps you only *record* findings — the findings file is written before any fix is applied, so the review stays honest.

```
1. Architect role — BEFORE any code
   → write docs/sprint-summary/sprint-N-architect.md: requirements, DB changes,
     full API contract with request/response examples, risks, success criteria
   → this file is the single source of truth for both build steps

2. Backend role   → build to the contract; append any deviations to the
                    architect file (frontend never reads backend code for the API)
3. Frontend role  → build against contract + recorded deviations;
                    loading/error/empty state on every data-fetching component

4. Security role  (adversarial — before the sprint commit)
   → review the sprint diff as an attacker, using the full checklist above
   → write sprint-N-security.md (findings with severity + file:line, concrete
     abuse scenarios) FIRST; end with BLOCK or CLEAR — fixes wait for step 6

5. QA role  (before the sprint commit)
   → happy path, invalid input, unauthorized user, wrong user's data,
     empty + large data; run `npm test` and `npm run test:integration`
   → write sprint-N-qa.md: pass/fail per case, defects with repros;
     end with BLOCK or CLEAR for the commit

6. Fix + commit
   → apply security/QA findings, then land multiple scoped commits
     (feat/fix/test per slice), never one monolith

7. Teaching role
   → write docs/sprint-summary/sprint-N.md
   → update CLAUDE.md sections the sprint changed
```

When spawning the agents instead (user asked, or true parallelism pays): the architect file must exist first, and every spawn prompt names that file plus the goal in the role's goal format — agents start cold; never make one infer the contract from another's code. The agent definitions pin `model: sonnet` so spawns don't burn Opus-rate usage; override per-spawn only when a slice genuinely needs more.

## Code Conventions

- All costs stored and computed in USD (float) — `costUsd` — not cents, since AI pricing is sub-cent
- Token counts are integers; latency is milliseconds (integer)
- API responses: `{ data: ..., error: null }` or `{ data: null, error: { code, message } }` — build with `jsonOk` / `errorResponse` / `toErrorResponse` from `lib/api/errors.ts`, never hand-rolled. Frontend reads `json.error?.message` for display and can branch on `json.error?.code`.
- `userId` (from Clerk) always required on protected routes — no cross-user data leakage
- Tailwind + shadcn/ui only — no custom CSS files
- Recharts for all data visualizations
- No `console.log` in committed code — use `lib/logger.ts` (structured, secret-scrubbed; `logger.exception` in catch blocks)
- Model pricing constants live in `lib/ai/pricing.ts` with a `// verified as of YYYY-MM-DD` comment — update when models change
- Direct providers (Anthropic, OpenAI, Gemini) for default/high-volume paths where prompt caching and batch API matter; OpenRouter only for long-tail models not available direct
- Streaming responses via Vercel AI SDK `streamText` — never buffer a full response before sending
- Eval jobs (AI-judge) always go through QStash — never run synchronously in a request handler
- CodeMirror 6 editor must be loaded with `dynamic(() => import(...), { ssr: false })` — it is client-only
