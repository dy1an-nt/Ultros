---
name: qa-sweep
description: Pre-completion spot-check for inline (non-sprint) Ultros changes — a convention grep sweep plus typecheck and the narrowest real test run, done by the lead session before calling a small fix done. Use after any inline edit to app/, lib/, or components/. If the change touches auth, user isolation, cost accounting, or share links, this sweep is NOT enough — run a real security-agent pass.
---

# QA spot-check (inline path)

For small fixes done in the lead session without subagents. Run every step over
what you touched before claiming done. This is the concrete form of CLAUDE.md's
"Verify before reporting", not a replacement for it.

## Escalation rule (not negotiable)

Anything touching **auth, user isolation, cost accounting, or public share
links** gets a real `security-agent` pass regardless of size. The sweep below is
for everything else.

## The sweep

```bash
# console.* is forbidden in committed code — use lib/logger.ts
# (lib/logger.ts itself is the one legitimate hit)
grep -rn "console\.\(log\|warn\|error\)" app lib components hooks store | grep -v "^lib/logger.ts"

# Hand-rolled response envelopes — routes build responses through lib/api/errors.ts
grep -rn "NextResponse.json" app/api

# Auth boundary — every protected route handler you changed must resolve a Clerk identity
git diff --name-only | grep '^app/api/.*route\.ts$' | xargs -r grep -L "auth()"

# User isolation — read the surrounding block for every Prisma call in a route you touched.
# This is a read prompt, not a pass/fail grep: scoping usually lives in the `where` a few
# lines below the call, so line-matching alone proves nothing.
grep -rn -A6 "prisma\.[a-zA-Z]*\.\(find\|update\|delete\|create\)" <files you touched>

# Client bundle leaks — a server-only env var must never be read in a client component
grep -rl '"use client"' app components hooks | xargs -r grep -n "process.env" | grep -v "NEXT_PUBLIC_"

# CodeMirror is client-only — a page that renders the editor must import it through
# dynamic(..., { ssr: false }), never as a plain import
grep -rn "^import.*editor/PromptEditor" app components
```

Grep output alone isn't a verdict. Read each hit in the files you touched and
confirm it's clean. A pre-existing hit elsewhere gets reported, not silently
fixed (CLAUDE.md, scope).

## Also verify

- `npm run typecheck` exits 0.
- The narrowest real test run for what changed, and paste its output:
  `npm test -- <pattern>` for `lib/` logic, `npm run test:integration` when any
  route changed.
- `{ data, error }` intact on every route touched, including error paths, and
  the frontend still reads `json.error?.message`.
- Any new provider or model id checked against `lib/ai/pricing.ts`, with the
  `// verified as of YYYY-MM-DD` comment updated if pricing moved.
- Any QStash consumer touched is still safe to deliver twice.
- New or changed API calls verified against a definition read this session,
  never invented.
