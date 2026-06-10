# Sprint 6 — Polish & Launch — Architect Plan

Status: Contract draft, architect-reviewed 2026-06-09. This sprint hardens and
ships; it adds one small feature surface (share links) and closes every debt
item parked during Sprints 1–5. Where this document deviates from the
CLAUDE.md baseline, this document wins.

## Architect changes vs the CLAUDE.md baseline (read first)

1. **Share scope pinned.** `POST /api/share` shares exactly one of:
   a PromptRun (single result), a DatasetRun (batch results), or an
   Experiment (full comparison). Read-only, revocable, no auth on the public
   view. Sharing a *prompt* (editable thing) is out of scope — this is an
   eval platform; you share results.
2. **Debt closure is in-contract, not best-effort.** Items parked earlier are
   listed in "Deferred fixes" below with their origin; QA tests them like
   features. The two from Sprint 1/2: aborted streaming runs persist partial
   token cost; prompt DELETE becomes a soft delete. The two Sprint 3 security
   nits: `Receiver.verify` gets the `url` argument (if not already done in
   Sprint 4); `runEvalJob`'s `console.error` logs the sanitized message, not
   the raw error.
3. **Budget alerts are in-app first.** New `UserSettings` model with
   `monthlyBudgetUsd`; banner at 80% and a blocking confirm at 100% on new
   run/batch launches. Email delivery is a stretch goal, not contract.
   "Blocking" means an extra confirmation, never a hard lockout of the user's
   own account.
4. **Rate limits pinned per route class** (Upstash Redis sliding window,
   keyed by userId; by IP only on the public share view):
   single runs + compare 30/min, eval triggers 60/min, dataset-run and
   experiment launches 5/min, mutations (CRUD) 60/min, public share views
   60/min/IP. 429 with `Retry-After`. Implemented once in `lib/rateLimit.ts`
   and applied as a helper call at the top of each route — no middleware
   magic that hides which routes are limited.
5. **Share tokens are 32+ chars of crypto randomness** (`nanoid(32)`), stored
   hashed? No — pinned: stored plain. They are capability URLs, not
   credentials equivalent to passwords; hashing would break "list my share
   links". Revocation (DELETE) and per-resource scoping bound the blast
   radius. Never index share pages (`noindex` + `X-Robots-Tag`).

## Requirements

Done when: deployed on Vercel with Sentry + Vercel Analytics live, a public
landing page positioned as an AI evaluation platform, share-via-link on
runs/dataset-runs/experiments, rate limiting on all API routes, budget
banner + confirm working, usage CSV export, README + demo video recorded,
and every deferred fix below verified closed.

## Deferred fixes (origin → fix)

1. **Aborted runs lose cost** (Sprint 1/2, memory note): when a streaming run
   is aborted client-side, persist the PromptRun with tokens streamed so far
   and `finishReason: "aborted"`. Fix in `app/api/run/route.ts` using the AI
   SDK `onAbort`/`onFinish` paths; UsageSummary still incremented.
2. **Prompt DELETE is hard** (CLAUDE.md says soft): add `deletedAt DateTime?`
   to Prompt; DELETE sets it; every prompt query gains `deletedAt: null`;
   runs/evals of deleted prompts remain for usage accounting but the prompt
   disappears from the UI. No restore UI this sprint (column makes it
   possible later).
3. **`runEvalJob` logs raw error** (Sprint 3 security review): pass the
   sanitized message to `console.error`.
4. **`Receiver.verify` without `url`** (Sprint 3 security review): bind
   signatures to the endpoint URL in `lib/jobs/verifySignature.ts`.
5. **Client/server rubric name limit mismatch** (Sprint 3 QA): align server
   to the client's 100-char cap (stricter side wins).

## DB changes (prisma/schema.prisma + migration)

```prisma
model Share {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  token        String    @unique // nanoid(32)
  resourceType String    // "promptRun" | "datasetRun" | "experiment"
  resourceId   String
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?

  @@unique([userId, resourceType, resourceId]) // re-share returns the existing link
  @@index([userId])
}

model UserSettings {
  id               String  @id @default(cuid())
  userId           String  @unique
  user             User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  monthlyBudgetUsd Float?  // null = no budget set
}
```

Plus `Prompt.deletedAt DateTime?`.

## New files / services

```
lib/rateLimit.ts                 # sliding-window limiter (Upstash Redis), one helper
lib/share/resolve.ts             # token → sanitized public DTO per resourceType
app/api/share/route.ts           # POST create (idempotent per resource), GET list
app/api/share/[token]/route.ts   # GET public DTO (no auth, IP-limited), DELETE revoke (auth)
app/share/[token]/page.tsx       # public read-only page (run / batch / experiment views)
app/api/usage/export/route.ts    # GET CSV (existing /api/usage data, streamed)
app/api/settings/route.ts        # GET/PATCH UserSettings (budget)
app/(dashboard)/settings/page.tsx
app/page.tsx                     # landing page (replace placeholder)
components/share/ ShareButton, ShareList, PublicRunView, PublicBatchView,
                  PublicExperimentView
components/usage/BudgetBanner.tsx
instrumentation.ts + sentry.*.config.ts   # Sentry (server + client)
README.md, docs/demo-script.md
```

New deps: `nanoid`, `@upstash/ratelimit`, `@upstash/redis`, `@sentry/nextjs`.
New env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.

## Public share DTOs (sanitization contract)

`lib/share/resolve.ts` is the only code that builds public payloads, and it
is allowlist-based — it copies named fields, never spreads a Prisma object:

- promptRun → model, createdAt, responseText, latencyMs, tokens, costUsd,
  finishReason, prompt title + version number, eval summary (score, passed,
  criteria names/scores). **Never:** userId, ids of private resources beyond
  the share itself, judge reasoning is included but error fields are not.
- datasetRun → aggregates, per-row table (input data, response, score).
  Dataset rows are the sharer's own uploaded data — sharing them is the
  point; the share dialog says so explicitly.
- experiment → results matrix + win matrix (no per-row drill-down on public
  experiments; link the underlying datasetRun shares instead if wanted).
- Revoked or unknown token → 404 with an identical body for both cases.

## API contract (request/response examples)

`POST /api/share`
```json
req:  { "resourceType": "datasetRun", "resourceId": "drun_12" }
res 201: { "data": { "token": "Vq3...32chars", "url": "https://.../share/Vq3...",
           "createdAt": "..." }, "error": null }   // 200 + same link if it already exists
res 404: resource not found or not yours (no existence leak).
```

`GET /api/share/:token` (public)
```json
res 200: { "data": { "resourceType": "datasetRun", "resource": { ... sanitized DTO ... },
           "sharedAt": "..." }, "error": null }
res 404: unknown OR revoked (indistinguishable).
res 429: rate limited (Retry-After header).
```

`PATCH /api/settings` → `{ "monthlyBudgetUsd": 25 }` → 200; null clears.
`GET /api/usage/export?from=2026-06-01&to=2026-06-30` → `text/csv`
(date, runs, input tokens, output tokens, cost) with the same
formula-injection guard as the Sprint 4 export.

## Launch checklist (deployment is part of the contract)

1. Vercel project: all env vars from CLAUDE.md plus Sentry/Redis; QStash
   signing keys set so `/api/jobs/*` come alive (they 503 until then —
   verify they 503, then verify they work).
2. Clerk production instance + webhook URL updated; Svix secret rotated.
3. `prisma migrate deploy` against Supabase (not `migrate dev`).
4. `NEXT_PUBLIC_APP_URL` set so QStash callbacks target production.
5. Sentry test event from server and client; Vercel Analytics visible.
6. Rate limits verified with a scripted burst (429 + Retry-After).
7. Landing page: positioned as AI evaluation platform (LangSmith/HumanLoop
   adjacent), screenshots of win matrix + regression chart, sign-up CTA.
8. README: architecture diagram, sprint summaries linked, local setup, env
   table. Demo video: prompt → rubric → dataset run → experiment →
   regression catch, under 4 minutes.

## Risks / security notes

- Share pages render user-generated text (responses, dataset cells) — React
  text nodes only, no `dangerouslySetInnerHTML`, no markdown rendering on
  public pages this sprint (markdown introduces an XSS surface for zero
  demo value).
- Share links are capability URLs: `noindex`, no referrer leakage
  (`Referrer-Policy: no-referrer` on share pages), revocation works
  immediately (no caching of resolve results).
- Rate limiter fails **open** if Redis is down (availability over strictness
  for a portfolio product) — but logs to Sentry so it's visible.
- Budget check reads UsageSummary aggregates — cheap, no extra provider
  calls; month boundary computed in UTC like the daily rows.
- Soft-deleted prompts must not resurrect via share links created earlier —
  resolve checks `prompt.deletedAt` and 404s.
- `.bin` shims broken on this volume — `node node_modules/...` invocations.

## Success criteria

1. Production URL serves the landing page; sign-up → dashboard works.
2. Each of the three share types renders publicly, revokes instantly, and
   leaks no private fields (QA diffs the DTO against the Prisma object).
3. Burst tests return 429 with Retry-After on every limited class.
4. Budget banner at 80%, confirm at 100%, clears when budget raised.
5. Aborted streaming run persists partial cost; deleted prompt vanishes from
   all lists but its usage history remains; both verified by QA.
6. Sentry shows a forced test error from server and client; no secrets in
   event payloads.
7. CSV exports open cleanly; formula guard verified.
8. `tsc --noEmit` clean; `next build` passes; no console.log.
