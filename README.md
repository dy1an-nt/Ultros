# Ultros

**AI evaluation and prompt experimentation platform.** Test prompts against multiple models, run them across datasets, score every output automatically (AI-as-judge + deterministic rubrics), and catch performance regressions between prompt versions — before your users do.

Positioned alongside LangSmith / HumanLoop / PromptLayer: every run is a first-class, scored, tracked experiment.

## What it does

- **Prompt workspace** — CodeMirror editor with system-prompt builder, `{{variable}}` templating, streaming runs, and full version history with diff/restore.
- **Multi-model** — Claude, GPT, and Gemini direct (prompt caching / batch-friendly paths) plus OpenRouter for the long-tail catalog. Side-by-side comparison across 3 models.
- **Evaluation engine** — rubrics combine AI-as-judge criteria with deterministic matchers (exact, regex, JSON schema, contains). Judge calls run async through QStash; every batch row is auto-scored.
- **Dataset testing** — upload CSV/JSON (≤ 500 rows), map columns to template variables, fan out a prompt version across every row with live progress, aggregates (mean, sample variance, pass rate, latency, cost), per-row drill-down, CSV export.
- **Experiments** — A/B/C/D variants × up to 3 models over a dataset; win matrix (pairwise difference of means), per-criterion breakdown, cell-level drill-down.
- **Regression testing** — pin a baseline run; any new version re-runs the same dataset/rubric/model and reports the score delta, a regressed verdict against a threshold, and *exactly which rows* flipped or dropped. Score-over-time chart.
- **Launch hardening** — share-via-link (read-only, revocable, never indexed), per-route-class rate limiting, monthly budget banner + confirm, usage CSV export, Sentry + Vercel Analytics.

## Architecture

```
Browser (Next.js App Router, React 19)
  ├─ TanStack Query (server state, self-terminating polls)
  ├─ Zustand (client state) · CodeMirror 6 · Recharts
  │
Next.js API routes (Vercel) ── Clerk JWT on every protected route
  ├─ lib/ai        → Vercel AI SDK: Anthropic / OpenAI / Google direct + OpenRouter
  ├─ lib/eval      → deterministic matchers + AI-judge jobs
  ├─ lib/datasets  → batch runner: per-row jobs, idempotent finalize
  ├─ lib/experiments, lib/regression → built ON the batch runner (a cell IS a DatasetRun)
  ├─ lib/rateLimit → Upstash Redis sliding windows per route class
  │
  ├─ Upstash QStash → signed webhooks fan out row/judge jobs (dev: in-process after())
  ├─ Supabase Postgres (Prisma 7) — every query scoped by userId
  └─ Sentry (server + client, env-gated)
```

Key design decisions are documented per sprint in [`docs/sprint-summary/`](docs/sprint-summary/) — each sprint has an architect contract and a teaching write-up.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the table below
npx prisma migrate dev       # or: node node_modules/prisma/build/index.js migrate dev
npm run dev
```

> Supabase note: if `DIRECT_URL` (the `db.<ref>.supabase.co` host) is unreachable from your network (it is IPv6-only), run migrations through the IPv4 session pooler: same credentials, host `aws-<region>.pooler.supabase.com`, port `5432`.

In development, batch jobs run in-process (sequential `after()` loop) — QStash cannot reach localhost. Production uses signed QStash webhooks with per-user flow control.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Supabase pooled connection (port 6543) | yes |
| `DIRECT_URL` | Direct connection for migrations | yes |
| `DB_PASSWORD` | DB password (injected by `prisma.config.ts`) | yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk auth | yes |
| `CLERK_WEBHOOK_SECRET` | Svix signature for user sync | yes |
| `ANTHROPIC_API_KEY` | Claude direct | ≥ 1 provider |
| `OPENAI_API_KEY` | GPT direct | optional |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini direct | optional |
| `OPENROUTER_API_KEY` | Long-tail catalog | optional |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (fails open if absent) | prod |
| `UPSTASH_QSTASH_TOKEN` | Job queue publish | prod |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Job webhook verification (503 until set) | prod |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring (no-op if absent) | prod |
| `NEXT_PUBLIC_APP_URL` | Absolute URL for QStash callbacks + share links | prod |

## Conventions

- API responses are always `{ data, error }`; costs in USD floats (`costUsd`), tokens as integers, latency in ms.
- Every protected query is scoped by the Clerk-derived `userId`; cross-user ids return 400/404 without an existence leak.
- Expensive launches (dataset runs, experiments) require a cost estimate + `confirm: true`.
- Rate limits per class: runs 30/min, evals 60/min, launches 5/min, mutations 60/min, public share views 60/min/IP — 429 + `Retry-After`.
- Public share payloads are allowlist-built in `lib/share/resolve.ts`; nothing else constructs them.

## Demo

See [`docs/demo-script.md`](docs/demo-script.md) for the < 4-minute walkthrough: prompt → rubric → dataset run → experiment → regression catch.
