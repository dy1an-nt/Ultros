# Sprint 6 — Polish & Launch

Teaching summary, written after security + QA sign-off. This sprint added one
feature surface (share links), closed every parked debt item as contract work,
hardened the API with rate limits and budget gates, and built the public face
(landing + auth shell) from the design files in `docs/design/`. Code is
launch-complete; the deployment steps that need account credentials are in the
launch checklist at the end.

## What each piece does and why

### Share links (the one new feature)

- `lib/share/resolve.ts` — the **only** code that builds public payloads, and
  it is allowlist-based: named fields are copied; a Prisma object is never
  spread. This makes "did we leak a private field?" a review of one file
  instead of an audit of every page. Sharing covers exactly three result
  types (promptRun, datasetRun, experiment) — you share *results*, not
  editable prompts. Revoked and unknown tokens are indistinguishable 404s.
- Tokens are `nanoid(32)` capability URLs stored **plain** (architect pin:
  hashing would break "list my links"; revocation + per-resource scope bound
  the blast radius). Re-sharing returns the same live link
  (`@@unique([userId, resourceType, resourceId])`); re-sharing after a revoke
  mints a **new** token — a revoked URL must stay dead forever.
- `app/share/[token]/page.tsx` renders server-side with `robots: noindex`,
  `referrer: no-referrer`, and the same per-IP rate limit as the API resolve.
  All user content renders as React text nodes — no `dangerouslySetInnerHTML`,
  no markdown on public pages (an XSS surface with zero demo value).
- Soft-deleted prompts cannot resurrect through old share links — resolve
  checks `prompt.deletedAt` on every path that reaches a prompt.

### Rate limiting

`lib/rateLimit.ts` — Upstash sliding windows, five route classes (runs 30/min,
evals 60/min, launches 5/min — the cost-fan-out class, mutations 60/min,
public share views 60/min/IP). Applied as an explicit two-line call at the
top of each limited handler — no middleware magic, so "which routes are
limited" is grep-able. Fails **open** when Redis is missing or down
(availability over strictness for a portfolio product) but reports the
failure to Sentry so silent no-limiting is visible. 429s carry `Retry-After`.

### Budget alerts

`UserSettings.monthlyBudgetUsd` + `GET/PATCH /api/settings` returning the
month-to-date spend (UsageSummary, UTC month boundary — same convention as
the daily rows). `BudgetBanner` shows at 80%; at 100% every launch surface
(single run, dataset run, experiment, regression) asks for an extra
confirmation via the shared `useBudgetGate()` hook. Pinned: never a hard
lockout of the user's own account — it is a deliberate-spend check, not a
paywall.

### Debt closure (contract items, QA-tested like features)

1. **Aborted streaming runs now persist partial cost.** The AI SDK emits no
   finish event (and no usage) on abort, so the route accumulates text via
   `onChunk` and persists in `onAbort` with `finishReason: "aborted"` and
   tokens estimated at ~4 chars each — the same heuristic as the dataset cost
   estimator. An aborted generation still consumed provider tokens; the books
   must say so.
2. **Prompt DELETE is now a soft delete** (`deletedAt`). Every prompt lookup
   (list, get, versions, runs, evals, leaderboard, baseline, regression,
   history, share resolve) filters it; runs/evals survive for usage
   accounting. No restore UI — the column makes it possible later.
3. **`runEvalJob` logs the sanitized message**, not the raw provider error
   (raw errors can echo request fragments).
4. **`Receiver.verify` URL binding** — verified already closed in Sprint 4.
5. **Rubric name cap aligned** server-side to the client's 100 chars
   (stricter side wins).

### Public face

- `app/page.tsx` implements `docs/design/Ultros Landing.dc.html` faithfully:
  dark-green system (#0B0F0D bg, #4FB286 brand), Source Serif 4 display,
  Hanken Grotesk body, Spline Sans Mono data accents via `next/font`. The
  "run #214" table is an illustrative product mock from the design.
- Auth pages share the brand shell (`app/(auth)/layout.tsx`) and a Clerk
  `appearance` theme (`app/(auth)/appearance.ts`). The authed dashboard keeps
  its existing theme — rethemeing it was judged risk-without-contract-value;
  the design system covers the public surface.
- Pricing/Docs/Changelog designs exist in `docs/design/` but were cut from
  launch scope deliberately.

### Monitoring

Sentry via `instrumentation.ts` (+ `sentry.server/edge.config.ts`,
`instrumentation-client.ts`), strictly env-gated: no DSN → no init, zero
behavior change in dev. `sendDefaultPii: false`. Vercel Analytics mounted in
the root layout. The build is **not** wrapped in `withSentryConfig` — source
map upload needs `SENTRY_AUTH_TOKEN` and is a deploy-time decision.

### One found-and-fixed launch blocker

`proxy.ts` (Clerk middleware) protected **all** API routes except an
allowlist — and `/api/jobs/*` was not on it. In dev this never surfaced
because batch jobs run in-process; in production every QStash delivery would
have been bounced by `auth.protect()`. The job routes are now public at the
middleware layer; their real auth is fail-closed QStash signature
verification (503 without keys, 401 on bad signature).

## Patterns worth knowing

- **Allowlist serialization at a single choke point** for public data (vs
  scattering `select:`s) — the sanitization contract is testable by diffing
  one module against the schema.
- **Capability URLs**: secret-in-URL authorization. The mitigations that make
  them acceptable: high entropy, noindex, no-referrer, instant revocation,
  per-resource scope, per-IP rate limit on resolution.
- **Fail-open vs fail-closed is a per-system decision**: the rate limiter
  fails open (availability; abuse risk is bounded), the job webhook fails
  closed (unsigned job execution burns money). Same codebase, opposite
  choices, both deliberate.
- **Soft delete as a filter, not a state machine** — one nullable timestamp +
  a `deletedAt: null` condition at every read path beats a parallel "trash"
  table until restore semantics are actually needed.

## What you should be able to explain in an interview

- Why share tokens are stored plain while passwords never are (capability vs
  credential; what hashing would and wouldn't protect here).
- Why aborted-stream accounting requires client-side accumulation (the
  provider's usage report rides the finish event that abort suppresses).
- The middleware allowlist bug class: dev/prod asymmetry hiding an auth-layer
  conflict between human auth (Clerk) and machine auth (webhook signatures).
- Why budget enforcement is a UX gate, not a server lockout, and where you'd
  draw that line differently for a multi-tenant billing product.

## Launch checklist (needs account credentials — handed off)

1. Vercel project + all env vars (`.env.example` is the canonical list).
2. Clerk production instance; webhook URL updated; Svix secret rotated.
3. `prisma migrate deploy` against Supabase (use the IPv4 session pooler if
   the direct host is unreachable — see README).
4. QStash signing keys set → verify `/api/jobs/*` 503s before, works after.
5. `NEXT_PUBLIC_APP_URL` set (QStash callbacks + share URLs depend on it).
6. Sentry DSNs set; force one server and one client error; check payloads.
7. Burst-test each rate-limit class → 429 + `Retry-After`.
8. Record the demo video per `docs/demo-script.md`.
