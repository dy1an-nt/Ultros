# Sprint 8: Public truth and model currency

Every earlier sprint added capability. This one removed claims. The `/docs` page described a Python
SDK, a CLI, API tokens, per-account provider keys, and a calibration command, none of which exist in
the repository. At the same time the model catalog had drifted far enough from the Anthropic API that
one advertised model was priced at three times its real cost.

The theme is the same in both halves: a public statement is only allowed to survive if something in
the code makes it true.

## What was wrong

### The docs described a product that was not built

`app/docs/page.tsx` had two reference sections, Python SDK and CLI, documenting an API surface with
method signatures and flags. There is no `ultros` package, no `ultros` command, and no code anywhere
in the repository that would produce one. The Installation and Quickstart pages opened with
`pip install ultros`, so the first instruction a reader followed was one that could not work.

Beyond the two invented sections, smaller claims were wrong in ways a user would hit immediately:

| Claim on the page | Reality in the code |
|---|---|
| `Settings → API Keys`, "you pay providers directly with your own keys" | Settings has monthly budget, usage export, and share links. Provider keys are deployment-level environment variables |
| REST API takes `Authorization: Bearer ultr_…` | Every route is authenticated by a Clerk session cookie. There is no token to issue |
| Error shape `{ data: null, error: "message" }` | `{ data: null, error: { code, message } }`, from `lib/api/errors.ts` |
| `POST /api/run` "streams via SSE" | It returns a plain text stream, not server-sent events |
| Rubric scores are 0 to 10, `pass_threshold=7.5` | Scores are 0 to 1 throughout. `validatePassThreshold` rejects anything outside that range |
| "Weights must sum to 1.0" | Weights are relative, any number above 0 up to 100, normalized by their own sum in `computeTotalScore` |
| `exact` compares against the `expected_output` column | `exact` compares against a literal in the criterion's own `config.expected` |
| CSV header `input,expected_output` | The reserved column is `expectedOutput`, spelled exactly that way |
| Datasets are JSON Lines, uploaded as multipart form | A JSON body with `csvText` or a `rows` array. Newline-delimited JSON is not parsed |
| "Uploading the same name creates a new version" | Datasets are immutable and not versioned. That immutability is what lets regression match rows by index |
| `tickets-1k`, a 1000-row dataset | `MAX_ROWS` is 500 |
| A GitHub Actions step running `ultros regression check` | No CLI and no API token, so no CI integration is possible |

### The model catalog had drifted

Checked against a live `GET /v1/models` and one real request per model on 2026-09-04:

| Model | Catalog said | Actually |
|---|---|---|
| Claude Opus 4.7 | $15 / $75 per MTok | $5 / $25 |
| Claude Opus 4.7 | 200K context | 1M |
| Claude Sonnet 4.6 | 200K context | 1M |

The Opus 4.7 price was the expensive one. Every cost recorded against an Opus 4.7 run, every batch
estimate, every experiment total, and the usage dashboard were all overstating spend by 3x.

Three current models were missing entirely: Claude Opus 5, Claude Sonnet 5, and Claude Fable 5.1.

## The two capability rules

Adding the new models was not a matter of appending rows, because they do not accept the same request
shape as the models already in the catalog.

### Sampling parameters are gone on newer models

Anthropic removed `temperature`, `top_p`, and `top_k` from Claude Opus 4.7 and the Claude 5 family.
This is not a deprecation warning. Verified directly:

```
claude-haiku-4-5   => OK
claude-sonnet-4-6  => OK
claude-opus-4-7    => ERROR invalid_request_error: `temperature` is deprecated for this model.
claude-sonnet-5    => ERROR invalid_request_error: `temperature` is deprecated for this model.
claude-opus-5      => ERROR invalid_request_error: `temperature` is deprecated for this model.
claude-fable-5-1   => ERROR invalid_request_error: `temperature` is deprecated for this model.
```

Ultros sends a temperature on every run, from `runStream`, `generate`, and the AI judge. Adding these
models without handling this would have shipped four models that 400 on first use.

`ModelInfo` gained `supportsSampling`, and the three call sites drop the parameter when it is false.
The UI does the matching thing: the temperature control is disabled with the selected model, and the
experiment configurator names the models a shared temperature will not reach, because there one
temperature applies across a set of models that may not agree.

### Thinking tokens are charged against your output ceiling

Opus 5, Sonnet 5, and Fable 5.1 reason before answering unless told not to, and those reasoning
tokens come out of the same `max_tokens` budget as the answer. Ultros defaults to 1024 output tokens.
On a reasoning-heavy prompt at that ceiling:

```
stop=max_tokens out=1024 textLen=890 endsMidSentence=true
```

The answer is cut off mid-sentence, and nothing in the response says why. With a headroom allowance
added on top of the requested ceiling, the same prompt finishes:

```
stop=end_turn out=1460 textLen=1342 complete=true
```

So `ModelInfo` also carries `thinksByDefault`, and `outputTokenBudget` adds
`THINKING_TOKEN_HEADROOM` (4096) for those models. The docs say plainly that this is an allowance and
not a guarantee, because a long enough chain of reasoning can still reach the ceiling.

The alternative was to disable thinking outright. That was rejected: on Opus 5 it risks reasoning
leaking into the visible response, and on Fable 5.1 it is not permitted at all. Adding room is the
option that works the same way on every model in the family.

## Why the docs now render the model table from the catalog

The pricing table on `/docs` maps over `MODEL_CATALOG`, the same constant `calculateCost` reads.
That is the whole point of this sprint expressed in one import. A price typed into prose is a claim
that can rot silently; a price rendered from the constant the runtime bills against cannot disagree
with the bill.

The cost is a small architectural compromise: a public client component now imports from `lib/ai/`.
That module holds only model metadata, and the environment lookups inside it are function-local and
never called on the client, so no secret and no environment value reaches the bundle. It was checked
rather than assumed.

## Files changed

| File | What it does now |
|---|---|
| `lib/ai/models.ts` | Catalog corrected against the live API. `supportsSampling` and `thinksByDefault` per model, plus `outputTokenBudget` and the `THINKING_TOKEN_HEADROOM` constant |
| `lib/ai/index.ts` | `runStream` drops temperature and topP for models that reject them, and asks for the thinking-adjusted ceiling |
| `lib/ai/generate.ts` | Same, for the non-streaming batch path |
| `lib/eval/judge.ts` | The judge call pins temperature to 0 only when the judge model accepts one, so `JUDGE_MODEL` can name either kind |
| `lib/ai/models.test.ts` | New. Locks the sampling and headroom behavior, including the four ids verified to reject temperature |
| `types/models.ts` | The client-facing model shape carries the two capability flags |
| `components/editor/RunControls.tsx` | Temperature slider disabled and relabelled for models without sampling |
| `components/datasets/RunConfigDialog.tsx` | Same, for batch runs |
| `components/experiments/ExperimentConfig.tsx` | Names the selected models the shared temperature will not reach |
| `app/docs/page.tsx` | Rewritten. SDK and CLI sections gone, Models and Roadmap added, every remaining claim checked against the code |
| `CLAUDE.md` | Sprint 8 recorded; the catalog convention now points at `lib/ai/models.ts` rather than `pricing.ts` |
| `package.json` | `@ai-sdk/anthropic` moved within its existing range to a version that knows the 5-series models |

## The Roadmap page

Deleting the SDK and CLI pages would have left a reader wondering whether those features were removed
or never existed. The Roadmap page names each one, marks it "Not built", and says what stands in its
place today. The removed pages are also acknowledged there in a sentence, because a docs site that
quietly loses a section is its own small dishonesty.

The regression and REST API pages carry the same marker inline, at the point where a reader would
otherwise assume CI gating or token auth exists.

## What you should be able to explain from this sprint

- Why a provider capability belongs in a data table rather than in an `if` at a call site. There are
  three call sites that send a temperature; a per-model flag means adding a fourth cannot forget.
- Why thinking tokens sharing the output ceiling is a correctness problem and not a cost problem.
  The failure mode is a truncated answer that looks like a bad model, not a large bill.
- The difference between a claim that is stale and a claim that was never true. The Opus 4.7 price was
  stale, and a date-stamped verification comment addresses that. The Python SDK was never true, and no
  process fixes that except not writing it.
- Why the public price is rendered from the constant the biller reads. Two copies of a number are two
  chances to be wrong.

## What to look up to go deeper

- `GET /v1/models` in the Anthropic API. It returns `max_input_tokens`, `max_tokens`, and a
  `capabilities` object per model, which is how the context-window corrections in this sprint were
  established rather than recalled.
- Extended thinking and the `effort` parameter. Ultros leaves effort at the provider default; tuning
  it per run is the natural next step for an evaluation platform, since it trades cost against quality
  within one model.
- Documentation testing. Nothing in CI would have caught the invented SDK, because no test asserts
  that a documented feature exists. The model table is now generated from code, which is the cheapest
  version of that idea.

## Honest note on process

This sprint did not run the full architect-first role sequence. It began as an audit, and the shape of
the work was only clear after reading the docs against the code. Verification was done live against
the Anthropic API and against the running app rather than from memory, and the evidence is quoted
above. The sprint protocol in `CLAUDE.md` is written for building features; a correction pass that
starts by finding out what is false does not have a contract to write first.
