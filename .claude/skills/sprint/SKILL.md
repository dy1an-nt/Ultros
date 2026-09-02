---
name: sprint
description: Run a full Ultros sprint through the agent team roles (architect → backend + frontend → security → QA → deploy → teaching), inline by default. Use when building a feature or any multi-file vertical slice, for example "run a sprint", "build [feature]", or "Sprint 8". NOT for single-file bug fixes, doc updates, or small refactors; those stay inline in the lead session and end with /qa-sweep.
---

# Sprint playbook

Seven roles per sprint, each owning a vertical slice. CLAUDE.md's Agent Team
System is the authority on what each role owns; this file is the protocol for
running them and the artifacts a sprint must leave behind.

**Inline is the default.** The lead session plays every role in order and writes
every artifact. Subagent spawns start cold and re-buy context the lead already
has, which costs real usage on this plan. Spawn the agents in `.claude/agents/`
only when the user asks for agents, or when the backend and frontend slices are
both large enough that parallel building beats two cold starts.

Role discipline while inline is the part that is easy to lose: during the
security and QA steps you only record findings. The findings file is written
before any fix is applied, so the review stays honest.

## Artifacts a sprint must produce

Every one of these lives in `docs/sprint-summary/`:

- `sprint-N-architect.md`, written before any code, requirements, DB changes,
  the full API contract with request and response examples, risks, success
  criteria. Backend deviations get appended to this file.
- `sprint-N-security.md`, findings with severity and `file:line`, concrete
  abuse scenarios, what was waived and why. Ends with BLOCK or CLEAR.
- `sprint-N-qa.md`. Cases exercised, pass or fail per case, defects with
  repros. Ends with BLOCK or CLEAR.
- `sprint-N.md`, the teaching summary, written last.

## Workflow

```
1. Architect   → docs/sprint-summary/sprint-N-architect.md
                 (single source of truth for both build steps)

2. Backend     → build to the contract; append deviations to the architect file
3. Frontend    → build against contract + deviations; loading, error, and empty
                 state on every data-fetching component

4. Security    → adversarial pass over the sprint diff; write the findings file
                 FIRST, then BLOCK or CLEAR. Fixes wait for step 6.
5. QA          → happy path, invalid input, unauthorized user, wrong user's
                 data, empty and large data. Run `npm test` and
                 `npm run test:integration`. Write the findings file, then
                 BLOCK or CLEAR.

6. Fix + commit → apply findings, then land multiple scoped commits
                 (feat/fix/test per slice), never one monolith
6b. Deploy      → if the sprint changes env vars, migrations, or anything that
                 has to happen in a specific order on Vercel, produce the
                 deployment checklist (see `devops-agent`) before shipping

7. Teaching    → docs/sprint-summary/sprint-N.md, plus the CLAUDE.md sections
                 the sprint changed
```

## Gates between steps

- Between build and security: `npm run typecheck` clean, and the backend's
  deviations recorded in the architect file.
- Between security and QA: no open Critical finding.
- Before the commit: `npm test` and, if any route changed,
  `npm run test:integration`, both green, with real output pasted into the
  report. A sprint with an open Critical is not done. No exceptions.
- Before closing: any new migration applied per `/migrate`, or the summary
  states in its own paragraph that it still must be.

## If you do spawn the agents

Subagents share no memory. Each launches blank except for its definition file,
so every prompt must be self-contained: the goal in the role's goal format, the
exact file paths, the pasted contract sections, and the expected output format.
"Per the architect's plan" means nothing to an agent that never saw the plan.

1. The architect file must exist and be saved before any spawn.
2. Launch `backend-agent` and `frontend-agent` together, each with the relevant
   contract sections pasted into the prompt.
3. A Critical finding goes back to the build agent with the finding quoted
   verbatim; the reviewing agent re-checks the fix.
4. The agent definitions pin `model: sonnet` so spawns don't burn Opus-rate
   usage. Override per spawn only when a slice genuinely needs more.
