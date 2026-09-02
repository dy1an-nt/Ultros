# Farewell security audit: 2026-07-06

A final cross-cutting adversarial pass, scoped to where a fresh review can beat
the existing gates (222 integration tests + per-sprint security reviews):
the newest post-hardening code, the unauthenticated + machine surfaces, the
money/usage path, and injection surfaces in user-controlled data, report only,
no fixes applied. Two findings, both low-to-medium; no criticals.

**Verdict: CLEAR.** Nothing here blocks a launch. Both findings are hygiene /
defense-in-depth on internal or DoS-only surfaces, with ready fixes.

**Status, 2026-09-01.** Both findings are closed. Finding 1 was fixed in
`08584c1` (the three call sites now use `logger.exception`). Finding 2 was fixed
by deriving the client IP from the rightmost proxy hop, covered by
`lib/rateLimit.test.ts`.

---

## Findings

### 1. `console.error(…, err)` bypasses the secret-scrubbing logger: 3 sites  (LOW–MED)

- `app/api/run/route.ts:138`. `console.error("Failed to persist prompt run:", err)`
- `app/api/compare/route.ts:157`. `console.error("Failed to persist compare run:", err)`
- `lib/datasets/runner.ts:70`. `console.error(\`Dataset row job ${run.id}:${rowIndex} failed:\`, err)`

**Why it's a finding.** Sprint 7 built `lib/logger.ts` specifically so every log
line runs through `sanitizeErrorMessage` before hitting Vercel's function logs,
the stated convention (CLAUDE.md) is "No `console.log` in committed code, use
`lib/logger.ts` … `logger.exception` in catch blocks." These three catch blocks
log the **raw `err`** through `console.error`, so they are the one path that
skips scrubbing.

**Concrete leak scenario.** In all three sites `err` originates from a Prisma
write or (in the runner) the AI provider call. A Prisma connection error can
carry the `DATABASE_URL` (with `DB_PASSWORD`); a provider error can echo the
outbound request including an `Authorization: Bearer <key>` header. Through
`logger.exception` those substrings are redacted; through `console.error` they
land in the Vercel logs verbatim. Exposure is to anyone with function-log
access (operator/internal surface, not a direct external attacker), which is
why this is hygiene, not a breach.

**Compounding factor.** The ESLint config (`eslint.config.mjs`) extends only
`next/core-web-vitals` + `next/typescript`; neither enables `no-console`. So
these pass CI lint clean and **nothing catches the next one.**

**Fix (when back on Opus).** Replace each with
`logger.exception("…", err, { …ids })`, then add
`"no-console": ["error", { allow: ["warn", "error"] }]`, or block `error` too
and route everything through the logger, to `eslint.config.mjs` so the gate
holds going forward. Small, self-contained, no behavior change.

### 2. `clientIp` trusts leftmost `X-Forwarded-For`: public rate limit is spoofable  (LOW)

- `lib/rateLimit.ts:70`. `return fwd ? fwd.split(",")[0].trim() : "unknown"`

**Why it's a finding.** This is the key for the only rate limit not keyed by an
authenticated `userId`: the public share-resolve view
(`app/api/share/[token]/route.ts`, class `sharePublic`). On Vercel the platform
*appends* the real client IP to `X-Forwarded-For`, so the **leftmost** entry is
attacker-controlled: a client sending `X-Forwarded-For: 1.2.3.4` makes
`clientIp` return `1.2.3.4`. Rotating that value bypasses the per-IP limit,
allowing unbounded share-resolve DB reads.

**Severity rationale: why LOW.** Share tokens are `nanoid(32)` (~191 bits), so
this is not an access-control bypass; it only defeats DoS/cost protection on the
resolve query. And the limiter already fails open (`lib/rateLimit.ts:48–58`), so
the guarantee was soft to begin with. Real, but bounded.

**Fix.** Derive the client IP from the rightmost XFF entry (the hop Vercel
controls) or Vercel's proxy-set client-IP header, rather than the leftmost.

---

## Checked and clean

- **Ollama provider (newest post-hardening code, `lib/ai/providers/ollama.ts`,
  `router.ts`, `models.ts`).** `OLLAMA_BASE_URL` is env-controlled, never
  user-controlled → no SSRF. Catalog entry gated on the env var; hardcoded
  `apiKey: "ollama"` is correct (Ollama ignores auth). Clean.
- **Share tokens.** `nanoid(32)` (crypto-strong); stored plain by design
  (capability URL, not a credential); re-share is idempotent; revoke mints a
  fresh token so the old URL stays dead. Public GET returns byte-identical 404s
  for unknown vs revoked with `noindex`/`no-store`. Owner-only DELETE.
- **Clerk webhook.** Svix signature verified before the body is trusted; fails
  closed when `CLERK_WEBHOOK_SECRET` is unset; only reads `id`/`username`/
  `image_url`, all rendered later through React text nodes (no
  `dangerouslySetInnerHTML` anywhere in `app`/`components`).
- **DLQ callback (`/api/jobs/failed`).** QStash-signature-verified, fail-closed;
  only reopens `pending`/`running` evals (never a `complete` one); acks
  unrecognized payloads 200 so the callback itself isn't retried.
- **CSV exports.** Both guard formula injection (`= + - @` → `'` prefix); the
  dataset export additionally quotes via `Papa.unparse`; the usage export feeds
  only server-generated numbers + ISO dates. Neither is injectable.
- **Raw SQL / XSS.** No `$queryRawUnsafe`/`$executeRaw` in app code (only the
  generated Prisma client). No `dangerouslySetInnerHTML`. No `Math.random` for
  anything security-bearing. No secrets interpolated into `logger.*` calls.

## Deliberately NOT re-audited (budget-scoped)

- **Per-route user isolation / IDOR.** CLAUDE.md claims every query is
  `userId`-scoped; the 222-test integration suite already exercises
  "authenticated as user B, request user A's resource" across all user-facing
  routes. Re-verifying by hand would duplicate that gate, trusted, not
  re-checked, by design given the usage limit.
- **Deep ReDoS / criteria-validation fuzzing.** Covered by
  `lib/eval/criteria.test.ts` + the sprint-3 review; not re-fuzzed here.
