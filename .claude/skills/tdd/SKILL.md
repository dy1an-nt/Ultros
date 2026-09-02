---
name: tdd
description: "Use only when the user explicitly asks for TDD, a failing test, or a regression test, OR when the bug has an obvious cheap test target. Skip when the test path is unclear, expensive, or not requested."
disable-model-invocation: true
---

# TDD bug fix

When fixing a bug with a clear, cheap test path, make the broken behavior executable before changing production code. The goal is a focused regression test that fails before the fix and passes after it.

Do not force a test when it would be impractical. If the available test would require broad harness setup, brittle mocks, live provider calls, production-only state, vague reproduction steps, or large unrelated fixture churn, skip adding a new test and use the closest useful verification instead.

## Where tests live in this repo

- **Unit (Vitest).** `*.test.ts` next to the code it covers, over the pure core: `lib/eval/`, `lib/experiments/`, `lib/regression/`, `lib/api/errors.test.ts`. Run with `npm test`, or `npm test -- <pattern>` for one file. This is the cheap target; prefer it.
- **Integration (Vitest, real Postgres).** `tests/integration/api/*.test.ts` import route handlers directly and run them against a disposable local `ultros_test` database. Clerk is mocked at the auth boundary in `tests/integration/setup.ts`; everything below it, including Prisma, runs for real. Run with `npm run test:integration`. This is the right target for anything about auth, user isolation, response envelopes, or status codes.
- **UI.** No component test runner is installed. Do not add one to fix a bug. The regression check for a UI bug is the running page plus `npm run typecheck`, and the "failing test is impractical" section below applies.

## Workflow

1. **Understand the bug.** Identify the intended behavior, current behavior, affected path, and smallest observable reproduction.
2. **Choose the narrowest executable check.** Prefer the closest existing test file for that codepath. A route bug almost always has a sibling in `tests/integration/api/` already. If no practical test path is obvious, do not invent one just to satisfy the workflow.
3. **Write the failing test first.** Add the smallest focused test that would have caught the bug. The test should encode intended behavior, not mirror the current implementation.
4. **Run the new test before fixing.** Confirm it fails for the intended reason. If it passes, or fails for an unrelated reason, correct the test or the reproduction before editing the implementation.
5. **Fix the bug.** Make the smallest production change that satisfies the intended behavior while preserving nearby contracts.
6. **Rerun the regression test.** Confirm it now passes.
7. **Run nearby validation.** `npm run typecheck`, the adjacent test files, and `npm run test:integration` when a route changed.

## If a failing test is impractical

Do not silently skip the regression step. Before fixing, explain why a failing test is impossible or not worth the cost, then choose the closest executable regression check available: a targeted script, a request against the running route, a manual reproduction in the running app, or a focused integration check.

Prefer no new test over a bad test. A bad test is one that mostly tests mocks, encodes current implementation details, depends on timing or unrelated global state, needs expensive infrastructure for a small fix, or would be deleted immediately after proving the fix. A test that calls a real AI provider is always a bad test here; stub at the `lib/ai/` boundary.

## Guardrails

- Do not change tests merely to match a wrong implementation.
- Do not weaken existing assertions unless the expected behavior genuinely changed and the reason is clear.
- Keep the regression test focused on the bug; avoid broad fixture churn.
- If the bug is flaky, make the test deterministic where possible and document the signal being locked down.
- If the bug exposes a broader class of failures, land the focused regression path first, then consider sibling coverage.
- Cost assertions are USD floats, token counts are integers, latency is integer milliseconds. A test asserting the wrong unit is testing the wrong thing.

## Final response

Report the evidence, not just the outcome:

- Name the failing-before test and quote the failure it produced.
- Name the passing-after run and any nearby validation performed.
- If failing-before evidence could not be demonstrated, say why and describe the closest regression check used instead.

Paraphrased results don't count (CLAUDE.md, "Verify before reporting").

---

Adapted from the `tdd` skill in [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (MIT).
