# Sprint 2: Multi-Model Platform

Teaching summary for the sprint that shipped in `8edc82a` and `441452b` on
2026-06-09.

A note on provenance, because it changes how much weight to put on this
document. Sprint 2 is the one sprint with no architect contract. It was built
before the contract-first workflow settled, so there is no `sprint-2-architect.md`
to read first, and this summary was reconstructed on 2026-09-02 from the code
as it stands and from the two commits that shipped it. Where I am describing
intent rather than something the code or a commit message states, the sentence
says so. Later sprints edited some of these files, and the sections below mark
what arrived when.

## The one idea that shapes everything

**Every model in the product is reached through one function, and the only
thing that varies is a string.**

`runStream({ model: "gpt-4o", ... })` and `runStream({ model: "claude-sonnet-4-6", ... })`
differ by an id. `resolveProvider` turns that id into a configured client, and
nothing above the seam knows which company serves the request.

That is worth stating plainly because of what it bought later. Sprint 3's
judge, Sprint 4's per-row dataset jobs, Sprint 5's experiment cells and
regression runs, and every screen that streams a response all call
`runStream`. None of them contain provider-specific code, and adding Ollama in
July (`f032c2e`) touched two files and no callers. The abstraction was chosen
in Sprint 2 and repaid across four later sprints.

## What each file does

### The catalog

`lib/ai/models.ts` is the single source of truth, and it is a static array
rather than anything fetched at runtime. Each entry carries the id, display
name, provider, category, context window, and input/output price per million
tokens. `getModelInfo` looks one up; `getAvailableModels` returns only the ones
whose provider is actually configured.

The pricing numbers living here, next to the model they describe, is what makes
`calculateCost` a pure function of the catalog. The file carries a
`// verified as of 2026-06-09` comment, which is the repo convention for
hand-maintained external facts.

### Routing and the streaming seam

`lib/ai/router.ts` maps a model id to a `LanguageModel`. It is a `switch` over
the provider field with a case per provider and no `default`, so TypeScript
reports a missing branch when a provider is added. The compiler enforces
completeness instead of a runtime error doing it later.

`lib/ai/index.ts` holds `runStream`, the only place the app calls
`streamText`. It also carries `onTextDelta` and `onAbort`, which exist because
an aborted stream never emits a finish event with usage, so a caller that wants
to persist partial output has to accumulate the text itself. That detail is
what lets `/api/run` save a run even when the user navigates away mid-response.

`interpolateVariables` lives here too, replacing `{{name}}` placeholders from a
plain map.

### The provider adapters

`lib/ai/providers/` holds one small file per provider, and their asymmetry is
the interesting part.

Claude, OpenAI, and Gemini are direct SDK factories, two or three lines each.
OpenRouter is an OpenAI-compatible client pointed at `openrouter.ai/api/v1`
with `HTTP-Referer` and `X-Title` headers for their dashboard attribution.

Both OpenRouter and Ollama export `client.chat` rather than the default model
factory. The comment in each file records why: the SDK's default targets the
Responses API at `/responses`, and neither service serves that endpoint for
these models. This is the kind of fact that costs an afternoon to discover and
one line to write down.

`ollama.ts` is not from this sprint. It arrived 2026-07-05 in `f032c2e` and is
included here because it is the proof that the seam held.

### Cost and validation

`lib/ai/pricing.ts` is `calculateCost(model, inputTokens, outputTokens)`,
returning USD as a float. Costs are floats rather than integer cents
throughout this codebase because per-token pricing is routinely sub-cent, and
rounding at write time would accumulate error across thousands of runs.

`lib/ai/validate.ts` did not ship with the feature commit. It came in the
follow-up pass `441452b`, described in its own commit message as a critical
bug-fix pass before Sprint 3, and it validates model, temperature, `maxTokens`,
and `topP` at the API boundary. Reading the diff, the route handlers previously
passed user input toward the provider with thinner checking. The lesson the
sprint records is that the boundary needed one validator both run paths could
share, rather than checks spread through each handler.

### Routes

`app/api/run/route.ts` gained model selection and cost persistence.
`app/api/models/route.ts` is six lines returning `getAvailableModels()`, which
is how the UI populates its picker without shipping the catalog to the client.

`app/api/compare/route.ts` is the substantial one. It accepts one to three
slots, runs them concurrently with `Promise.all`, and multiplexes all of them
into a single NDJSON response where every event carries its `slot` index.
Three concerns are visible in its structure:

- `safeEnqueue` swallows the throw that `controller.enqueue` produces once the
  client disconnects, so one dead socket cannot abort the other slots or skip
  persistence.
- Persistence is wrapped separately from generation, with a comment saying
  persistence failures must not be reported as generation errors, because the
  model output already succeeded by then.
- Every slot shares one auth check, one rate-limit decision, and one prompt
  interpolation.

Later sprints edited this file: rate limiting in Sprint 6, the
`{ code, message }` error envelope in Sprint 7, and structured logging on
2026-09-01.

`app/api/usage/route.ts` reads `UsageSummary` rows since a UTC-midnight
boundary and returns both a total and a daily series.

### Storage and frontend

`UsageSummary` is a denormalized daily rollup, unique on `(userId, date)`,
written by an upsert that increments counters as runs complete. `PromptRun`
stays authoritative, and the comment in the compare route says exactly that.
The rollup exists so the dashboard never scans the run table.

On the client, `store/compareStore.ts` holds per-slot state,
`hooks/useCompareRun.ts` parses the NDJSON stream and routes each event to its
slot, `hooks/useModels.ts` and `useUsage.ts` fetch through TanStack Query, and
`components/compare/` plus `components/usage/` render the panels and the
Recharts cost chart.

## Key decisions and why

**A static catalog instead of provider model listings.** Every provider exposes
an endpoint that lists its models. Using them would keep the catalog fresh and
would also make cost non-deterministic, add a network failure mode to page
load, and leave no pinned price to compute a stored `costUsd` from. The cost of
the choice is real: the catalog goes stale silently, and the
`verified as of` comment is the only thing pushing back. Nothing in CI checks
those numbers against reality.

**Direct providers for the default paths, OpenRouter only for the long tail.**
OpenRouter could serve every model behind one key, which would delete most of
`providers/`. It is not used that way because prompt caching and batch APIs
only work when calling a provider directly, and those are exactly the features
that matter for high-volume paths like scoring a dataset. OpenRouter's roughly
5% markup buys catalog breadth, which is worth it for a Mistral or DeepSeek run
you do once, and not worth it for the default model. The catalog's `category`
field encodes the split.

**Availability is derived from configuration, not hardcoded.**
`isProviderConfigured` checks for the provider's env key, and
`getAvailableModels` filters on it, so a deployment missing `OPENAI_API_KEY`
never offers GPT-4o in the picker. Advertising a model whose key is absent
guarantees a runtime failure the user cannot act on. Ollama reuses the
mechanism with a twist worth noticing: it keys on `OLLAMA_BASE_URL`, which is
not a secret but a presence flag, which is why local models never surface in
production where that variable is unset.

**One multiplexed response for compare, not three requests.** Three parallel
requests would have been simpler on the server and would have meant three auth
checks, three rate-limit decisions, and three sockets. Streaming NDJSON with a
slot tag on every event keeps it to one of each and lets the client interleave
chunks as they arrive.

## Patterns worth knowing

**Ports and adapters.** `runStream` is the port; the files in `providers/` are
adapters. The test suite leans on this directly, stubbing `lib/ai` at the
`runStream` seam so execution-route integration tests never call a real
provider.

**Exhaustiveness checking as a safety net.** A `switch` with no `default` over
a union type turns "someone added a provider and forgot to wire it" into a
compile error.

**Capability gating by configuration.** The set of features a deployment
advertises is computed from its environment rather than assumed.

**A read model beside the write model.** `UsageSummary` is a projection;
`PromptRun` is the log. Keeping both, and being explicit about which one is
authoritative, is the pattern that later let the usage dashboard stay fast.

**Streaming multiplexing.** One response carrying tagged events for several
concurrent producers, with the reader dispatching on the tag.

## What you should be able to explain in an interview

- Why the model catalog is static, and what you give up by pinning prices in
  code rather than reading them from an API.
- The actual reason to call Anthropic and OpenAI directly when an aggregator
  would work: prompt caching and batch endpoints do not survive the hop, and
  those matter precisely where volume is highest.
- How `resolveProvider` plus an exhaustive switch makes adding a provider a
  compile-time-checked change, and why Ollama landing a month later touched
  only two files.
- Why OpenRouter and Ollama need `client.chat` rather than the SDK's default
  model factory, which is a concrete question about the Responses API versus
  chat completions.
- How one HTTP response streams three concurrent model outputs, and why
  `enqueue` throwing on a disconnected client must not abort the other slots or
  skip the database write.
- Why a failed persistence must not be reported to the user as a failed
  generation.
- Why cost is a float in USD here when most money in most systems should be an
  integer of the smallest unit.

## Known gaps in this sprint's work

- No architect contract exists, so there is no recorded success criteria to
  check the implementation against.
- Catalog prices were verified once, on 2026-06-09, and nothing re-verifies
  them.
- `lib/ai` has no unit tests of its own. It is exercised through the execution
  route integration suites, where `runStream` is stubbed, so the router and the
  catalog filters are covered only indirectly.

## To go deeper

- The Vercel AI SDK provider specification, for what a `LanguageModel` must
  implement and why an OpenAI-compatible base URL is enough for OpenRouter and
  Ollama.
- Anthropic and OpenAI prompt caching and batch APIs, which are the concrete
  reason the direct path exists.
- NDJSON versus server-sent events for multiplexed streaming, and what each
  costs on the client.
- CQRS and read models, for the general form of the `UsageSummary` pattern.
