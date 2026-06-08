# PromptLab — Full Project Plan
> Architect-ready specification for a production-grade AI evaluation & prompt experimentation platform

---

## 1. Project Overview

**PromptLab** is a production-grade AI evaluation and prompt experimentation platform — think LangSmith / HumanLoop / PromptLayer, not "another AI playground." Developers test prompts against multiple models, run them across datasets, score outputs automatically (AI-as-judge + rubrics), and catch performance regressions between prompt versions. Every run is a first-class, scored, tracked experiment.

**Positioning:** Not a prompt-sharing community. An AI evaluation platform. This is rare in student portfolios and pairs with RestaurantIQ to show both traditional full-stack SaaS *and* modern AI infrastructure engineering.

**Goals:**
- Portfolio flagship demonstrating LLM engineering, AI evaluation, and AI infrastructure depth
- Genuine tool for understanding LLM behavior across models, datasets, and versions
- Resume bullets that stand out: "built automated prompt regression testing system," "multi-model evaluation engine with AI-as-judge scoring"

**Core thesis:** Real prompt engineers don't test one prompt once. They test many prompts against datasets, score the outputs, and track whether changes improve or regress performance. PromptLab is built around that loop.

---

## 2. Tech Stack

### Frontend
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** Zustand (client state) + TanStack Query (server state)
- **Editor:** CodeMirror 6 (prompt editor with syntax highlighting)
- **Charts/Analytics:** Recharts
- **Auth UI:** Clerk (handles OAuth, magic link, session management)

### Backend
- **Runtime:** Node.js with Next.js API Routes (or separate Express if needed)
- **ORM:** Prisma
- **Database:** PostgreSQL via Supabase
- **Auth:** Clerk (JWT verification middleware)
- **Caching:** Redis via Upstash (rate limiting, response caching)
- **Queue:** Upstash QStash (async eval jobs)

### AI / Model Layer (Hybrid Routing)
- **Direct providers:** Anthropic Claude, OpenAI GPT, Google Gemini — used for headline models where full feature control matters (prompt caching, batch API, provider-specific headers)
- **Aggregator:** OpenRouter — single OpenAI-compatible endpoint routing to the long tail of models (Llama, DeepSeek, Mistral, and dozens more) for catalog breadth
- **Abstraction:** Vercel AI SDK (unified streaming interface) wrapping both direct providers and OpenRouter behind one internal `lib/ai/` interface
- **Token counting:** tiktoken (OpenAI), Anthropic token API; OpenRouter returns usage in its response
- **Routing rule:** cost-optimized default models + caching/batch paths route DIRECT; breadth/experimental models route via OpenRouter

### Infrastructure
- **Hosting:** Vercel (frontend + API routes)
- **Database:** Supabase (PostgreSQL + storage)
- **File Storage:** Supabase Storage (prompt exports, attachments)
- **Monitoring:** Vercel Analytics + Sentry
- **CI/CD:** GitHub Actions

---

## 3. Feature Specification

### 3.1 Prompt Editor
- Rich text editor (CodeMirror 6) with variable interpolation `{{variable}}`
- Live streaming AI responses with token-by-token rendering
- Temperature, max tokens, top-p controls per run
- Stop sequences configuration
- Response format toggle (text / JSON mode)
- Save prompt with title, tags, description

### 3.2 System Prompt Builder
- Separate panel for system prompt construction
- Persona templates (e.g. "You are a helpful assistant...", "You are an expert in...")
- Role/instruction/constraint/format sections with guided builder UI
- Save system prompts independently and attach to any prompt run

### 3.3 Evaluation Engine (CORE FEATURE)
This is the heart of the platform — every run is scored, not just generated.
- **Auto-capture per run:** score, cost, latency, token counts, pass/fail — tracked automatically, not as an afterthought
- **AI-as-judge:** send response to a judge model with a rubric, get structured score + reasoning back
- **Rubric builder:** user-defined criteria (accuracy, conciseness, tone, format adherence, etc.) with weights
- **Pass/fail thresholds:** define what "passing" means per criterion
- **Deterministic scoring options:** exact match, regex match, JSON schema validation, contains-keyword — for objective, repeatable signals (critical for trustworthy regression testing)
- **Eval history** per prompt version, queryable and chartable
- *Design note: the eval signal must be stable (fixed datasets, deterministic where possible, controlling for model nondeterminism) before regression testing can build on it. Build this solid first.*

### 3.5 Dataset Testing
The feature that separates PromptLab from a playground.
- Upload a dataset (CSV/JSON) — e.g. 100 customer reviews, support tickets, Q&A pairs
- Define a prompt template with `{{variables}}` mapped to dataset columns
- Run the prompt across the entire dataset against one or more models
- Aggregate metrics per model: avg score, consistency (variance), avg latency, total cost
- Per-row drill-down to inspect individual outputs and scores
- Export results

### 3.6 Prompt Experiments (A/B/C testing)
- Define multiple prompt variants (Prompt A / B / C)
- Run all variants across the same dataset with the same eval rubric
- Statistical comparison: which variant wins, by how much, with confidence
- Win-rate matrix and per-criterion breakdown
- Demonstrates statistics, experimentation, and data analysis — strong engineering signal

### 3.7 Regression Testing (KILLER FEATURE)
The resume bullet: "Built automated prompt regression testing system."
- Set a baseline (e.g. Version 7, score 84%) on a fixed dataset + rubric
- On each new version, re-run the baseline dataset and compare
- Automatic regression detection: "Version 8 scored 67% — regression detected on 12 rows"
- Performance tracking over version history (score-over-time chart)
- Failure detection: surface exactly which dataset rows regressed
- Requires the stable eval signal from 3.4 — that's the hard, impressive part

### 3.8 Model Comparison
- Side-by-side panel layout (up to 3 models simultaneously)
- Supported models (direct):
  - Claude Opus 4.8 / Sonnet 4.6 / Haiku 4.5
  - GPT-5.2 / GPT-5-mini
  - Gemini 3.1 Pro / Flash
- Extended catalog (via OpenRouter): Llama, DeepSeek, Mistral, Qwen, and dozens more
- Each model in the picker tagged by source (direct / OpenRouter) and cost tier (cheap / balanced / premium)
- Per-model token count, latency, and estimated cost shown inline
- Sync mode: send same prompt to all selected models simultaneously
- Combined estimated cost shown before send (the biggest spend risk)

### 3.9 Token & Cost Tracking
- Per-run: input tokens, output tokens, latency (ms), estimated cost (USD)
- Per-user dashboard: daily/weekly/monthly usage graphs
- Per-model cost breakdown (using live pricing constants, updatable in config)
- Budget alerts (optional soft limit with warning)
- Export usage history as CSV

### 3.10 Prompt Versioning & History
- Every run saved as an immutable record (prompt text + params + response + metadata)
- Named versions (v1, v2... or custom labels)
- Diff view between two versions
- Restore any previous version
- Run history timeline per prompt

### 3.11 Share via Link (lightweight — NOT a social platform)
- Read-only public link to a single prompt or experiment result (for demos / sending to a recruiter)
- No profiles, no likes, no gallery, no social graph — deliberately minimal
- Costs almost nothing to build, high demo value

---

## 4. Data Models

### User
```
id, clerk_id, username, avatar_url, created_at
```

### Prompt
```
id, user_id, title, description, tags[], created_at, updated_at
```

### PromptVersion
```
id, prompt_id, version_number, label, system_prompt, user_prompt, variables{}, created_at
```

### PromptRun
```
id, prompt_version_id, user_id, dataset_row_id (nullable), experiment_id (nullable),
model, provider, temperature, max_tokens,
input_tokens, output_tokens, latency_ms, cost_usd, response_text,
finish_reason, created_at
```

### Rubric
```
id, user_id, name, criteria[] (name, weight, type: ai_judge|exact|regex|json_schema|contains),
pass_threshold, created_at
```

### Evaluation
```
id, prompt_run_id, rubric_id, total_score, passed (bool),
criteria_scores{}, ai_eval_reasoning, eval_method, created_at
```

### Dataset
```
id, user_id, name, description, row_count, columns[], created_at
```

### DatasetRow
```
id, dataset_id, row_index, data{} (column -> value), expected_output (nullable)
```

### Experiment
```
id, user_id, name, dataset_id, rubric_id, variant_version_ids[], models[],
status (pending|running|complete), created_at, completed_at
```

### ExperimentResult (aggregate per variant×model)
```
id, experiment_id, prompt_version_id, model,
avg_score, score_variance, avg_latency_ms, total_cost_usd, pass_rate, created_at
```

### Baseline (for regression testing)
```
id, prompt_id, prompt_version_id, dataset_id, rubric_id,
baseline_score, baseline_pass_rate, set_at
```

### RegressionRun
```
id, baseline_id, new_version_id, new_score, score_delta,
regressed (bool), regressed_row_ids[], created_at
```

### UsageSummary (materialized / cron-updated)
```
id, user_id, date, total_runs, total_input_tokens, total_output_tokens, total_cost_usd
```

---

## 5. API Routes

### Auth (handled by Clerk webhooks)
- `POST /api/webhooks/clerk` — sync user to DB on sign-up

### Prompts
- `GET /api/prompts` — list user's prompts
- `POST /api/prompts` — create prompt
- `GET /api/prompts/:id` — get prompt with versions
- `PATCH /api/prompts/:id` — update metadata
- `DELETE /api/prompts/:id` — soft delete

### Versions
- `POST /api/prompts/:id/versions` — save new version
- `GET /api/prompts/:id/versions` — list versions
- `GET /api/prompts/:id/versions/:versionId` — get single version

### Runs
- `POST /api/run` — execute prompt against model(s), stream response
- `GET /api/prompts/:id/runs` — run history for a prompt

### Evaluations
- `POST /api/runs/:runId/eval` — score a run against a rubric (AI-judge or deterministic, queued if AI)
- `GET /api/rubrics` — list user rubrics
- `POST /api/rubrics` — create rubric
- `GET /api/prompts/:id/evals` — eval history for a prompt

### Datasets
- `GET /api/datasets` — list datasets
- `POST /api/datasets` — upload/create dataset (CSV/JSON parse)
- `GET /api/datasets/:id` — get dataset with rows
- `DELETE /api/datasets/:id`

### Experiments
- `POST /api/experiments` — create + launch experiment (variants × dataset × models, queued)
- `GET /api/experiments/:id` — status + aggregate results
- `GET /api/experiments/:id/results` — per-variant/model breakdown
- `GET /api/experiments/:id/rows` — per-row drill-down

### Regression Testing
- `POST /api/prompts/:id/baseline` — set baseline (version + dataset + rubric)
- `POST /api/prompts/:id/regression` — run new version against baseline, detect regressions
- `GET /api/prompts/:id/regression/history` — score-over-time

### Share
- `POST /api/share` — create read-only public link for a prompt or experiment result
- `GET /api/share/:token` — public read-only view (no auth)

### Usage
- `GET /api/usage` — user usage stats (dashboard)
- `GET /api/usage/export` — CSV export

---

## 6. App Pages & Routing

```
/                        → Landing page (hero, features, CTA)
/sign-in                 → Clerk auth
/sign-up                 → Clerk auth
/dashboard               → User home (recent prompts, experiments, usage summary)
/prompts                 → Prompt library list view
/prompts/new             → Create new prompt
/prompts/:id             → Prompt detail (editor + run history + evals + versions)
/prompts/:id/compare     → Model comparison view
/prompts/:id/regression  → Regression testing (baseline vs versions, score-over-time)
/datasets                → Dataset library
/datasets/:id            → Dataset detail + rows
/experiments             → Experiment list
/experiments/new         → Configure experiment (variants × dataset × models × rubric)
/experiments/:id         → Experiment results (win matrix, per-criterion, drill-down)
/rubrics                 → Rubric library + builder
/usage                   → Usage dashboard with charts
/settings                → Account, API keys, budget preferences
/share/:token            → Read-only public view (no auth)
```

---

## 7. Folder Structure

```
promptlab/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # sign-in, sign-up
│   ├── (dashboard)/              # protected routes
│   │   ├── dashboard/
│   │   ├── prompts/
│   │   ├── datasets/
│   │   ├── experiments/
│   │   ├── rubrics/
│   │   ├── usage/
│   │   └── settings/
│   ├── share/                    # public read-only views
│   ├── api/                      # API routes
│   │   ├── run/
│   │   ├── prompts/
│   │   ├── datasets/
│   │   ├── experiments/
│   │   ├── rubrics/
│   │   ├── share/
│   │   ├── usage/
│   │   └── webhooks/
│   └── layout.tsx
├── components/
│   ├── editor/                   # CodeMirror prompt editor
│   ├── compare/                  # Side-by-side comparison panels
│   ├── eval/                     # Rubric builder, scoring UI, eval results
│   ├── datasets/                 # Dataset upload, row viewer
│   ├── experiments/              # Experiment config, win matrix, drill-down
│   ├── regression/               # Baseline UI, regression detection, score-over-time
│   ├── usage/                    # Charts, cost breakdown
│   └── ui/                       # shadcn/ui base components
├── lib/
│   ├── ai/                       # Vercel AI SDK wrappers — direct providers + OpenRouter behind one interface
│   ├── eval/                     # Scoring engine: AI-judge, exact/regex/json/contains matchers
│   ├── experiments/              # Experiment runner, aggregation, statistics
│   ├── prisma.ts                 # Prisma client singleton
│   ├── redis.ts                  # Upstash Redis client
│   ├── pricing.ts                # Token cost constants per model
│   └── auth.ts                   # Clerk helpers
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── store/                        # Zustand stores
├── hooks/                        # Custom React hooks
├── types/                        # Shared TypeScript types
├── docs/
│   └── sprint-summary/           # sprint-N.md agent summaries
├── .env.local
├── next.config.ts
└── package.json
```

---

## 8. Build Sprints
> Defined by done-criteria, not timelines.

### Sprint 1 — Foundation
*Done when you can write a prompt, hit Claude, and see a saved run in the DB.*
- Next.js scaffolding (TypeScript + Tailwind + shadcn/ui)
- Clerk auth (sign up, sign in, protected routes)
- Prisma schema + Supabase PostgreSQL connection
- Prompt editor UI (CodeMirror 6) + system prompt builder
- Single-model streaming run endpoint (Claude first)
- Save prompt + run to DB
- Prompt versioning (save, list, diff, restore)

### Sprint 2 — Multi-Model Platform
*Done when you can run any prompt against Claude, GPT, Gemini, or OpenRouter models with full cost tracking.*
- `lib/ai/` hybrid layer: direct providers + OpenRouter behind one interface
- GPT + Gemini direct integration via Vercel AI SDK
- OpenRouter integration for extended catalog
- Model comparison (side-by-side, 3 models, sync send)
- Token + cost tracking per run
- Usage dashboard with Recharts

### Sprint 3 — Evaluation Engine (the core)
*Done when every run is automatically scored against a rubric, with both AI-judge and deterministic methods.*
- Rubric builder (criteria, weights, pass thresholds)
- AI-as-judge scoring (judge model via QStash queue)
- Deterministic matchers (exact, regex, JSON schema, contains)
- Auto-capture score/cost/latency/pass-fail per run
- Eval history + scoring leaderboard
- *Get the eval signal stable here — everything downstream depends on it.*

### Sprint 4 — Dataset Testing
*Done when you can upload a dataset and run a prompt across all rows against multiple models with aggregate metrics.*
- Dataset upload + parse (CSV/JSON)
- Variable mapping (template `{{vars}}` → dataset columns)
- Batch run across dataset × models (queued)
- Aggregate metrics: avg score, consistency/variance, latency, cost
- Per-row drill-down + results export

### Sprint 5 — Experiments & Regression Testing (the killer features)
*Done when you can A/B/C test prompt variants statistically AND detect regressions against a baseline.*
- Prompt experiments: multiple variants × dataset × rubric, win matrix, per-criterion stats
- Baselines: pin a version + dataset + rubric
- Regression detection: re-run baseline, compute delta, flag regressions
- Failure detection: surface which rows regressed
- Score-over-time / performance tracking charts

### Sprint 6 — Polish & Launch
*Done when it's live in production.*
- Landing page (positioned as AI evaluation platform)
- Share-via-link (read-only public views)
- Sentry + Vercel Analytics
- Rate limiting via Upstash Redis
- Budget alerts + CSV export
- README + demo video
- Production deployment

---

## 9. Environment Variables

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

# Upstash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
UPSTASH_QSTASH_TOKEN=

# App
NEXT_PUBLIC_APP_URL=
```

---

## 10. Key Technical Decisions & Rationale

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 14 App Router | SSR, API routes, streaming support, Vercel-native |
| Auth | Clerk | Production-grade, handles OAuth/magic link, minimal setup |
| AI abstraction | Vercel AI SDK | Unified streaming across Claude/GPT/Gemini, built for Next.js |
| AI routing | Hybrid: direct + OpenRouter | Direct for headline models (caching, batch, full control); OpenRouter for catalog breadth & fallbacks. Shows both provider-direct integration skill AND pragmatic aggregator use |
| ORM | Prisma | Type-safe, great DX, works perfectly with Supabase Postgres |
| Caching/Rate limit | Upstash Redis | Serverless-compatible, no persistent connection needed |
| Async jobs | Upstash QStash | Serverless-safe message queue for eval jobs |
| Editor | CodeMirror 6 | Best-in-class code editor, extensible, used by VSCode internals |
| State | Zustand + TanStack Query | Lightweight client state + powerful server state caching |

---

## 11. Cost Optimization Strategy

**Goal:** keep per-user API spend as low as possible while still delivering best-in-class results when it matters.

### Model Pricing Reference (per million tokens, input/output — verify before launch)

| Model | Input | Output | Use For |
|---|---|---|---|
| Claude Haiku 4.5 | $1.00 | $5.00 | Default, casual testing, routing |
| Gemini Flash | ~$0.30 | — | Cheapest fast option |
| GPT-5.2 | ~$1.75 | ~$14.00 | Balanced GPT tier |
| Gemini 3.1 Pro | ~$2.00 | ~$12.00 | Balanced Gemini tier |
| Claude Sonnet 4.6 | $3.00 | $15.00 | Best price-to-quality balance |
| Claude Opus 4.8 | $5.00 | $25.00 | Flagship / hardest tasks only |

*Output tokens cost ~5x input across Claude models. Pricing shifts when new models launch — store these in `lib/pricing.ts` with a "verified as of" date comment.*

### Strategies

**1. Smart defaults**
- Default model on every new prompt = a cheap tier (Haiku 4.5 or Gemini Flash)
- Flagship models (Opus, GPT-5.2, Gemini Pro) are opt-in, never the default
- Show a subtle "cheap / balanced / premium" badge next to each model in the picker

**2. Cost-visible-before-send**
- Display estimated cost BEFORE the user hits run, especially on model comparison
- Model comparison (3 models at once) shows combined estimated cost up front — this is the single biggest spend risk
- Confirm dialog if a single comparison run is estimated above a threshold

**3. Prompt caching (90% input savings)**
- Cache system prompts and long context blocks that get reused across runs
- Especially valuable for the system prompt builder — same system prompt tested against many user prompts
- Cache hit reads cost ~0.1x standard input price

**4. Batch API for async work (50% savings)**
- Route all AI-assisted evaluations (judge model calls) through the Batch API since they run async via QStash anyway
- Batch + caching stack — a cached batch eval can be up to ~95% cheaper than a naive call

**5. Token budgeting**
- Sensible default max_tokens cap (e.g. 1024) so runs don't balloon unexpectedly
- Per-user soft budget with warning before hitting it
- Usage dashboard surfaces cost-per-model so users self-correct

**6. "Best result" mode**
- Explicit toggle that escalates to flagship models + higher token budgets
- Clearly labeled as the premium path so users choose cost-vs-quality consciously

**7. Direct-vs-OpenRouter routing**
- Cost-optimized default models + caching/batch paths go DIRECT — this is where the real savings live (caching and batch only work on direct connections)
- OpenRouter handles the long-tail/experimental catalog where breadth matters more than per-token savings
- OpenRouter adds a small (~5%) markup, so never route default/high-volume traffic through it — reserve it for models you can't get direct
- Pricing for OpenRouter models pulled from its API rather than hardcoded, since the catalog is large and changes often

### Net Effect
Casual users stay on Haiku/Flash and run hundreds of prompts for a few dollars. Power users opt into flagships only when they need top quality. The platform never silently spends premium money on the user's behalf.

---

## 12. Claude Code Agent Team Structure

Mirrors the RIQ 4-agent structure:

- **Frontend Agent** — UI components, pages, editor, gallery, usage charts
- **Backend Agent** — API routes, Prisma models, auth middleware, AI provider wrappers
- **QA/Integration Agent** — end-to-end tests, API contract validation, type checking
- **Teaching Agent** — produces `docs/weekly-summary/week-N.md` after each session
