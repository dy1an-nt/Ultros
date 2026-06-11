# Ultros demo script (target: under 4 minutes)

One continuous story: a support-triage prompt gets a rubric, proves itself on a
dataset, beats a rival variant in an experiment, and a bad edit gets caught by
regression testing. Record at 1080p; keep the cursor deliberate.

## Prep (before recording)

- Account signed in; budget set to a small number so the banner is showable.
- Prompt "support-triage" with v1 saved (uses `{{question}}`).
- Dataset "tickets" uploaded: ~50 rows, columns `question`, `expectedOutput`.
- Rubric "helpfulness": 1 ai_judge criterion (clarity), 1 contains, 1 regex.
- One complete scored dataset run of v1 (this becomes the baseline on camera).

## Script

**0:00 — Landing (10s).** Open `/`. "Ultros is an AI evaluation platform —
every prompt run is scored, tracked, and comparable." Click *Start evaluating*
→ dashboard.

**0:10 — Prompt + streaming run (40s).** Open the prompt. Show system prompt +
`{{question}}` templating. Pick a model, hit Run, let the response stream.
Point at the run history row: tokens, latency, cost — "every run is recorded
with its exact cost."

**0:50 — Rubric (30s).** Open Rubrics. Show "helpfulness": AI-judge criterion
next to deterministic matchers, weights, pass threshold. "Scores combine an
LLM judge with checks that can't drift."

**1:20 — Dataset run (50s).** Open the dataset → Run prompt. Pick v1 + model +
rubric; variables map automatically; show the cost estimate and tick the
confirm box. Launch. Progress bar fills; aggregates appear: avg score, pass
rate, variance, latency, cost. Expand one row: input → response → per-criterion
scores. Click *Export CSV* briefly.

**2:10 — Experiment (50s).** Experiments → New. Pick v1 and v2, two models —
"2×2, four cells, every cell is a full dataset run." Estimate → confirm →
launch. Cells complete live. Results: per-cell table, then the win matrix —
"v2 beats v1 by +0.07 on Claude; this cell is under-sampled so it's flagged,
not trusted." Show the per-criterion breakdown: "v2 wins on clarity, ties on
format."

**3:00 — Regression catch (45s).** Prompt → Regression. Set baseline from the
existing scored run of v1 ("I bless these numbers"). Now run the check against
v3 — a deliberately worsened version. Delta comes back negative past the
threshold: **regressed**, with the exact rows that flipped listed. "This is
the deploy gate: not vibes — row-level evidence." Show the score-over-time
chart.

**3:45 — Share + close (15s).** Click Share on the experiment, open the public
link in an incognito window — read-only, no auth, revocable. "Ship prompt
changes with evidence. Ultros." End.

## Backup beats (if time allows / retakes)

- Budget banner at 100% asking for launch confirmation.
- Aborting a streaming run, then showing the partial run still recorded with
  `finishReason: aborted` and its cost in Usage.
- Revoking the share link and refreshing the public page → 404.
