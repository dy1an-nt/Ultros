# Security Review: `withUser` / `lib/db/repos.ts` refactor

Scope: `git diff fc13fd3~1..HEAD` (commits `fc13fd3`, `aaeffa3`, `5c13f09`, `f54c871` on
`claude/design-patterns-discussion-0zxzxc`). New files `lib/api/handler.ts`, `lib/db/repos.ts`,
`tests/integration/lib/handler.test.ts`; every route under `app/api` rewritten to
`withUser` except `GET /api/share/[token]`, `app/api/jobs/*`, `app/api/models`, and
`app/api/webhooks/clerk`, which were confirmed untouched (`git diff` on those paths is empty).

Method: read every modified route's diff against its pre-refactor version line by line,
traced every isolation branch (missing / foreign-owned / soft-deleted) through both the old
hand-rolled checks and the new `ownable()` verdicts in `lib/db/repos.ts`, then ran the
integration suite and typecheck against a local Postgres to confirm behavior.

```
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ultros_test DB_PASSWORD=postgres \
  npx vitest run --config vitest.integration.config.ts
```
Result: 21 files, 229 tests, all passing. `npm run typecheck` clean.

## Findings

### INFO: the version route's stated behavior delta is narrower than the actual one
`app/api/prompts/[id]/versions/[versionId]/route.ts:1-17`

The task description says the only observable change is "a version of a soft-deleted prompt
now 404s instead of 200." That's true for the *owner* reading their own archived prompt. But
the old code never consulted `deletedAt` in this route at all, it only compared
`version.prompt.userId !== user.id`. So there's a second, unmentioned case: a **foreign**
user requesting a version of a prompt that happens to be soft-deleted used to get `403
FORBIDDEN` (old code: ownership mismatch, no deletedAt check) and now gets `404 NOT_FOUND`
(new code: `db.prompt.require()` checks `visible` before `ownerOf`, so a soft-deleted row
returns 404 regardless of who owns it).

Concretely: user A soft-deletes prompt P (owned by A). User B, who has a stale link to a
version of P, requests it. Old response: 403. New response: 404.

This is a behavior change beyond what was described, but it is capability-hiding in the
*safer* direction (favors 404 over 403, leaking less about a resource's existence/ownership
to a non-owner), consistent with `requireHidden`'s intent elsewhere in the file. Not a
regression, just flagging that the actual diff is broader than the one-line summary and
should be called out in any changelog/PR description. No fix needed.

### Waived: pre-existing NUL-byte artifact in `experiments/[id]/results/route.ts`
Not part of the security surface, noting for completeness since `git diff` rendered this
file as a binary diff (`Bin 3171 -> 2693 bytes`). The pre-refactor file had a literal NUL
byte (not a printable character) embedded in the win-matrix grouping key at line 52:
`` `${cell.promptVersionId}\0${cell.model}\0${cs.name}` ``. The refactor incidentally
replaced it with an ordinary space when the file was rewritten. Confirmed via
`perl -ne 'print if /\x00/'` that the old file had one such byte and the new file has none.
This predates the refactor, isn't attacker-reachable, and isn't a security defect (a NUL
separator is if anything more collision-resistant than a space), so no action needed beyond
this note.

## Checked and clean

**Every migrated route's isolation semantics, verified against the pre-refactor code:**
`compare`, `dataset-runs/[id]` (+`/export`, `/rows`), `datasets` (+`/[id]`, `/run`,
`/run-estimate`, `/runs`), `evals/[id]`, `experiments` (+`/[id]`, `/[id]/results`,
`/[id]/rows`), `prompts` (+`/[id]`, `/[id]/baseline`, `/[id]/evals`, `/[id]/leaderboard`,
`/[id]/regression`, `/[id]/regression/history`, `/[id]/runs`, `/[id]/versions`,
`/[id]/versions/[versionId]`), `rubrics` (+`/[id]`), `run`, `runs/[runId]/eval`,
`settings`, `share` (+`/[token]` DELETE), `usage` (+`/export`).

- No route lost an ownership check. Every place the old code compared `row.userId !==
  user.id` or `row.deletedAt !== null` now goes through the equivalent `ownable()` verdict
  (`require`/`requireHidden`/`requireRef`) with the same missing/foreign/deleted outcome,
  confirmed case by case (see method above). No 404-that-should-be-403 or
  403-that-should-be-404 introduced anywhere else besides the one INFO item above.
- `db.rubric.requireRef`, `db.dataset.requireRef`, `db.datasetRun.requireRef` are always
  called with a value already type-checked as `string` at the call site (`runs/[runId]/eval`,
  `datasets/[id]/run`, `experiments`, `prompts/[id]/baseline`, `prompts/[id]/regression`), so
  a non-string body field can never reach a Prisma `where: { id }` filter.
- Rate-limit ordering: in every route that both rate-limits and does an ownership/existence
  check, the old code always ran the rate limit *before* the check (auth → user lookup →
  `checkRateLimit` → row lookup). The wrapper preserves that order exactly (rate limit inside
  `withUser`, before the handler body runs). No route relied on the ownership check running
  first.
- `promptVersion` deliberately skipping `deletedAt` is scoped to exactly the two routes that
  need it (`run`, `compare`, executing a version a user owns regardless of the parent
  prompt's archive state) and matches those routes' pre-refactor behavior byte for byte (old
  code there never checked `deletedAt` either). Every route that lists/reads *prompt* data
  (`prompts/[id]`, `prompts/[id]/versions`, `prompts/[id]/evals`, `prompts/[id]/runs`,
  `prompts/[id]/leaderboard`) goes through `db.prompt.require`/`requireDetail`, which does
  check it, again matching old behavior. The split is defensible and consistently applied.
- No `where` clause is built by spreading attacker-controlled data after `...db.scope`; every
  `...db.scope` spread in the diff (`usage`, `usage/export`, `prompts/[id]/evals`,
  `prompts/[id]/leaderboard`, plus the two repo-internal list queries) is followed only by
  server-computed keys (`date`, `status`, `promptId`) that never collide with `userId`, so
  mass assignment into the scope is not possible.
- The boundary catch (`lib/api/handler.ts:73-80`): unhandled throws are scrubbed through
  `logger.exception` (secret-scrubbed message, safe context) and `Sentry.captureException`,
  then always collapse to `toErrorResponse(err)` for a non-`ApiError`, which unconditionally
  returns the generic `INTERNAL` body regardless of what the error contains. Verified with a
  live test (`tests/integration/lib/handler.test.ts`) that a thrown driver-style error
  ("connection terminated unexpectedly") reaches the client only as
  `{ code: "INTERNAL", message: "An unexpected error occurred" }`, status 500, while Sentry
  gets the real exception. No stack trace, driver error, or secret can reach the response
  body through this path, equivalent to (in fact stricter than) the pre-refactor state where
  an unhandled throw propagated to Next's default error handling.
- `lib/api/handler.ts` resolves the Clerk session and DB user identically to every route's
  old inline code (`auth()` → `NOT UNAUTHORIZED` → `prisma.user.findUnique` →
  `NOT_FOUND "User not found"`), so no route lost its auth check by moving to the wrapper.
- Public route `GET /api/share/[token]` is untouched and still outside `withUser` by design
  (a comment now calls this out explicitly); job routes and the Clerk webhook are untouched
  and keep their own signature-based verification, not Clerk session auth.
- No OpenRouter/Anthropic/OpenAI/Clerk secret, connection string, or raw Prisma error
  appears in any new code path (`handler.ts`, `repos.ts`, or any rewritten route).
- Reran the full integration suite (229 tests, 21 files) and `tsc --noEmit`: both clean
  against a local Postgres.

## Waived

- Deep review of files the refactor didn't touch (`lib/share/resolve.ts`,
  `lib/datasets/runRequest.ts`, dataset upload parsing, rubric regex validation) was out of
  scope for this pass since `git diff` shows them unmodified; spot-checked
  `resourceBelongsToUser`/`loadRunRequest` only to confirm the routes that still call them
  directly (`datasets/[id]/run-estimate`, `datasets/[id]/run`, `share` POST) pass the same
  `userId` they always did.
- `readJson`'s cast to `Record<string, unknown>` doesn't runtime-check that the parsed JSON
  is actually an object (a JSON body of `null` would throw on first property access,
  collapsing to the generic 500 path rather than a 400). This is identical to the
  pre-refactor `let body: Record<string, unknown>; body = await req.json()` pattern in every
  route, not a regression introduced here, so left out of scope.

## Verdict: CLEAR
