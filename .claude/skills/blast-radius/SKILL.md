---
name: blast-radius
description: "Find what a change could break somewhere else before it ships, beyond the diff, and prove the one fact it's safe because of by running real code instead of writing it up. Use for 'blast radius of X', 'what could this break', or reviewing a small diff you don't trust."
disable-model-invocation: true
---

# Blast radius

Find what a change breaks somewhere else, before it ships. Use for "blast radius of X", "what could this break", or reviewing a small diff you don't trust yet.

Companion to `why`. `why` tells you why the code is shaped the way it is. Blast radius tells you what it breaks somewhere else.

Listing the callers is not the job. You can grep those in a second. The job is the breakage grep won't show you.

## Don't trust your own writeup

A blast-radius writeup that sounds right is worthless. It reads as convincing whether or not it's true, and that is the trap you are walking into. So don't hand back the writeup. Find the one or two facts the whole thing depends on and prove them by running code. Words are where you start, not what you ship.

### How sure are you

For each fact the change's safety depends on, get it as far down this list as is cheap, and say where it stopped.

1. You said so. Worthless on its own.
2. You pointed at the line. A real `file:line`, or the library's own source.
3. You showed the bad case can't happen. You walked the failure step by step and it doesn't reach.
4. You ran it. A script or test that calls the real code and fails loud if you're wrong.
5. You reproduced it in the running app (`curl` against the route, the page loaded in the browser).

Any safety fact you can't get to step 4, say so out loud. Don't write it up as settled. Step 4 is usually one small script, one `npm test -- <pattern>`, or one `npm run test:integration -- <pattern>` run that calls the exact function you're worried about.

This is the same standard as CLAUDE.md's "Verify before reporting": exercised, not just compiled.

## Steps

1. Read the change. The diff, the symbols it adds, changes, and deletes, and what it now does differently, including the part the diff doesn't spell out.
2. Find the one fact it's safe because of. Most changes that look scary are safe because of a single fact, like "this claim only ever transitions an Evaluation from unstarted to leased". Find that fact. If it holds, most of the scary cases die at once. Spend your time here, not on a long list of maybes.
3. Look where grep stops. Read the source of the library you call, and check its pinned version in `package.json` (Next 16, React 19, Prisma 7, and AI SDK 6 all moved fast; do not answer from memory of an older major). Work out when things run: server components vs client, `after()` deferrals, streaming responses that finish after the handler returns, QStash consumers that retry. Follow what a symbol search misses: the JSON shape a route returns, a Prisma column, a provider's wire format, a model id in `lib/ai/pricing.ts`, code three hops downstream. In this repo, check these five every time:
   - **User isolation.** Does the change touch any Prisma query that must be filtered by `userId`? A leak here is the worst failure this codebase has.
   - **Response envelope.** Is `{ data, error }` still intact on every route in the diff, built through `lib/api/errors.ts`, including error paths? Does the frontend still read `json.error?.message`?
   - **Cost and tokens.** `costUsd` still a USD float, token counts still integers, latency still integer milliseconds?
   - **Job idempotency.** Any QStash consumer touched still safe to deliver twice (the leased claim in `lib/eval/runEvalJob.ts` is the reference)?
   - **Migrations.** Is a `prisma/migrations/` change additive and safe against a database that already has data? See `/migrate`.
4. Be honest about each risk. Give it a real chance of happening and a real cost if it does. Keep the risks you confirmed; list the ones you checked and cleared separately. Cite a real `file:line`. A search that finds nothing is still an answer. Never make up a caller or an API.
5. Prove the one fact. Write a script or test that runs the real code, run it, and paste what happened. If you can't prove it cheaply, mark it unproven. Don't round up.
6. For a wide change, or anything touching auth, user isolation, cost accounting, or share links, this skill is not enough on its own. Run a real `security-agent` pass as well, and `qa-agent` if behavior changed.

## What to hand back

- **What it does.** What changed, including the part that isn't obvious.
- **The one fact it's safe because of.** State it, say which step you got it to, and show the proof. If you couldn't prove it, write unproven.
- **Risks.** Only the real ones. Each names how it breaks, the `file:line`, how likely and how bad, and how to check. Paste the proof for the ones that matter.
- **Cleared.** What you checked and why it's fine.
- **Before you merge.** The cheapest test or repro that catches the real bug, including the script you wrote.

Write it through `unslop`, cite real code, and strip anything private before it goes anywhere public.

**Reply:** the writeup above, with the one safety fact either proven or marked unproven.

---

Adapted from the `blast-radius` skill in [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan (MIT).
