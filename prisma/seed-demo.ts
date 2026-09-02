// Demo workspace seeder, populates the first User with the demo-script.md
// scenario: a support-triage prompt (3 versions), a mixed rubric, a 20-row
// ticket dataset, a scored baseline run, a 2×2 experiment, and a regression
// history ending in a catch. Re-runnable: deletes its own named entities first.
//
//   npm run seed:demo
import { config } from "dotenv"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import type { Prisma } from "../app/generated/prisma/client"

config({ path: ".env.local" })
config({ path: ".env" })

function parseUrlComponents(url: string) {
  const withoutProto = url.replace(/^[^:]+:\/\//, "")
  const lastAt = withoutProto.lastIndexOf("@")
  const userInfo = withoutProto.slice(0, lastAt)
  const hostPath = withoutProto.slice(lastAt + 1)
  const colonIdx = userInfo.indexOf(":")
  const user = decodeURIComponent(colonIdx >= 0 ? userInfo.slice(0, colonIdx) : userInfo)
  const [hostPort, ...dbParts] = hostPath.split("/")
  const [host, portStr] = hostPort.includes(":") ? hostPort.split(":") : [hostPort, "5432"]
  const database = dbParts.join("/").split("?")[0] || "postgres"
  return { user, host, port: parseInt(portStr ?? "5432"), database }
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is not set")
const password = process.env.DB_PASSWORD
if (!password) throw new Error("DB_PASSWORD is not set")
const { user: dbUser, host, port, database } = parseUrlComponents(connectionString)
const ssl = process.env.PGSSLMODE === "disable" ? undefined : { rejectUnauthorized: false }
const pool = new Pool({ user: dbUser, password, host, port, database, ssl })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

// Deterministic RNG so re-seeding produces identical numbers.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260707)
const between = (lo: number, hi: number) => lo + rand() * (hi - lo)
const intBetween = (lo: number, hi: number) => Math.round(between(lo, hi))

const daysAgo = (d: number, minuteOffset = 0) =>
  new Date(Date.now() - d * 24 * 60 * 60 * 1000 + minuteOffset * 60 * 1000)

// ---------------------------------------------------------------------------
// Scenario content
// ---------------------------------------------------------------------------

const PROMPT_TITLE = "Support ticket triage"
const DATASET_NAME = "Support tickets"
const RUBRIC_NAME = "Helpfulness"
const EXPERIMENT_NAME = "v1 vs v2, tone rewrite"

const SYSTEM_V1 = `You are a support assistant for Acme Cloud, a developer platform.
Answer customer tickets accurately and concisely. If the issue needs account
access you do not have, say so and route the customer to the right channel.
Never invent product features.`

const SYSTEM_V2 = `You are a support assistant for Acme Cloud, a developer platform.
Answer customer tickets accurately, warmly, and concisely.

Structure every reply:
1. Acknowledge the customer's issue in one sentence.
2. Give the resolution steps as a short numbered list.
3. Close by offering follow-up help.

If the issue needs account access you do not have, say so and route the
customer to the right channel. Never invent product features.`

const SYSTEM_V3 = `You are a support bot for Acme Cloud. Answer tickets in as few
words as possible. Do not add pleasantries or closing offers.`

const USER_PROMPT = `Customer ticket:

{{question}}

Write the reply to the customer.`

const MODELS = {
  sonnet: { id: "claude-sonnet-4-6", provider: "anthropic", inPerM: 3.0, outPerM: 15.0, latency: [1100, 2600] as const },
  gpt4o: { id: "gpt-4o", provider: "openai", inPerM: 2.5, outPerM: 10.0, latency: [800, 2100] as const },
  gemini: { id: "gemini-2.0-flash", provider: "google", inPerM: 0.1, outPerM: 0.4, latency: [500, 1400] as const },
}
const JUDGE = { id: "claude-haiku-4-5", inPerM: 1.0, outPerM: 5.0 }

type Ticket = { question: string; expected: string; topic: string; steps: string[] }

const TICKETS: Ticket[] = [
  { question: "How do I reset my password? The reset email never arrives.", expected: "Check spam, verify the account email, resend from the sign-in page; support can trigger a manual reset.", topic: "your password reset", steps: ["Check your spam or promotions folder for mail from no-reply@acme.cloud", "Confirm the address on your account is the one you're checking", "Use “Forgot password” on the sign-in page to resend the link"] },
  { question: "My API requests started returning 429 errors this morning. Nothing changed on our side.", expected: "Rate limit exceeded; check the usage dashboard, back off with retries, or raise the plan limit.", topic: "the 429 errors you're seeing", steps: ["Open Dashboard → Usage to see which key is hitting its per-minute limit", "Add exponential backoff to retries so bursts spread out", "If sustained traffic grew, raise the limit under Plan → API limits"] },
  { question: "I was double-charged for my subscription this month. Can I get a refund?", expected: "Apologize, confirm the duplicate charge, refund via billing within 5-7 business days.", topic: "the duplicate charge", steps: ["I've flagged the duplicate invoice to our billing team", "The refund is issued to the original payment method", "Expect it to post within 5–7 business days"] },
  { question: "How do I enable two-factor authentication for my whole team?", expected: "Org admins can require 2FA under Settings → Security; members are prompted at next sign-in.", topic: "team-wide two-factor auth", steps: ["Go to Settings → Security as an org admin", "Toggle “Require two-factor authentication”", "Members without 2FA are prompted to enroll at their next sign-in"] },
  { question: "Can I export all my project data? We need it for a compliance review.", expected: "Full export available under Settings → Data export; arrives as a signed download link within an hour.", topic: "your data export", steps: ["Open Settings → Data export", "Choose “Full project export (JSON + CSV)”", "You'll get a signed download link by email within the hour"] },
  { question: "Does Acme Cloud support SAML SSO with Okta?", expected: "Yes on the Business plan; configure under Settings → SSO with the Okta metadata URL.", topic: "SAML SSO with Okta", steps: ["SSO is available on the Business plan and above", "In Settings → SSO, paste your Okta metadata URL", "Assign the Acme Cloud app to your Okta users to finish"] },
  { question: "My webhooks stopped firing yesterday. The endpoint hasn't changed.", expected: "Check webhook logs for failures; endpoints are auto-disabled after 3 days of 5xx responses and must be re-enabled.", topic: "your webhook deliveries", steps: ["Check Dashboard → Webhooks → Delivery log for recent failures", "Endpoints are auto-paused after three days of 5xx responses", "Fix the receiver, then click “Re-enable” on the endpoint"] },
  { question: "How do I permanently delete my account and all associated data?", expected: "Settings → Account → Delete; irreversible after the 14-day grace period; confirmation email required.", topic: "account deletion", steps: ["Go to Settings → Account → Delete account", "Confirm via the email we send you", "Data is retained 14 days (in case you change your mind), then erased"] },
  { question: "What happens to my data if I downgrade from Business to Starter?", expected: "Nothing is deleted; features above Starter limits become read-only until usage fits the plan.", topic: "downgrading your plan", steps: ["No data is deleted on downgrade", "Projects above Starter limits switch to read-only", "Archive or remove projects until you're within the limit to regain writes"] },
  { question: "I need an invoice with our VAT number on it. Where do I add that?", expected: "Add the VAT ID under Billing → Company details; past invoices regenerate on request.", topic: "VAT on your invoices", steps: ["Open Billing → Company details and add your VAT ID", "Future invoices include it automatically", "Reply here with invoice numbers you need regenerated"] },
  { question: "API latency from eu-west has doubled since last week. Are you aware of issues?", expected: "Point at the status page incident for eu-west; suggest region failover config meanwhile.", topic: "the eu-west latency", steps: ["We have an open incident for eu-west on status.acme.cloud", "Engineering is rolling out a fix; ETA is on the incident page", "As a stopgap, enable region failover under Project → Regions"] },
  { question: "Is there a mobile app, or a mobile-friendly dashboard?", expected: "No native app; the dashboard is responsive, and alerts can go to Slack or email.", topic: "mobile access", steps: ["There's no native app today", "The web dashboard is fully responsive on phones", "For on-call, route alerts to Slack or email under Notifications"] },
  { question: "How do I connect Acme Cloud to GitHub Actions for deploys?", expected: "Use the official acme/deploy action with a deploy token created under Settings → Tokens.", topic: "the GitHub Actions integration", steps: ["Create a deploy token under Settings → Tokens (scope: deploy)", "Add it to your repo secrets as ACME_TOKEN", "Use the acme/deploy@v2 action in your workflow"] },
  { question: "Can I buy 5 more seats mid-cycle, and how is that billed?", expected: "Yes; seats added mid-cycle are prorated on the next invoice.", topic: "adding seats", steps: ["Add seats anytime under Billing → Seats", "Mid-cycle additions are prorated to your renewal date", "The prorated amount appears on your next invoice"] },
  { question: "Our trial expires Friday but the team is on holiday. Can we extend it?", expected: "One-time 14-day extension available; confirm and apply it.", topic: "your trial extension", steps: ["I've applied a one-time 14-day extension to your trial", "No card is charged during the extension", "Your new expiry date is visible under Billing"] },
  { question: "The dashboard showed a 500 error for about 10 minutes today. Was there an outage?", expected: "Confirm the incident, link the status page post-mortem, note API was unaffected.", topic: "this morning's dashboard errors", steps: ["Yes. The dashboard had a brief incident (status.acme.cloud has the post-mortem)", "The API and your workloads were unaffected", "Subscribe to the status page for real-time notices"] },
  { question: "Security team asks: where is customer data stored and is it encrypted at rest?", expected: "Data in AWS us-east-1/eu-west-1, AES-256 at rest, TLS in transit; SOC 2 report available on request.", topic: "our security posture", steps: ["Data lives in AWS us-east-1 or eu-west-1, chosen per project", "Everything is encrypted at rest (AES-256) and in transit (TLS 1.2+)", "Our SOC 2 Type II report is available under NDA, ask and we'll send it"] },
  { question: "How do I rotate an API key without downtime?", expected: "Create a second key, deploy it, then revoke the old one; keys can overlap.", topic: "zero-downtime key rotation", steps: ["Create a new key under Settings → API keys. Keys can coexist", "Deploy the new key to your services", "Revoke the old key once traffic on it drops to zero"] },
  { question: "I want to cancel my subscription at the end of this billing period.", expected: "Cancel under Billing → Plan; access continues to period end; data retained 30 days after.", topic: "your cancellation", steps: ["Choose “Cancel at period end” under Billing → Plan", "You keep full access until the period closes", "We retain your data for 30 days after, in case you return"] },
  { question: "Do you have a sandbox environment where API calls don't count against quota?", expected: "Yes; sandbox keys under Settings → API keys hit a stubbed environment for free.", topic: "the sandbox environment", steps: ["Create a sandbox key under Settings → API keys", "Sandbox calls hit a stubbed environment and are free", "Swap to a live key when you're ready for production"] },
]

// Reply generators per version, the deterministic rubric criteria (contains
// "thanks", regex follow-up offer) must actually match what each version says.
function replyV1(t: Ticket): string {
  return `Thanks for reaching out about ${t.topic}. ${t.steps.join(". ")}. Let us know if that doesn't resolve it.`
}
function replyV2(t: Ticket): string {
  return `Thanks for getting in touch, sorry for the trouble with ${t.topic}.\n\n${t.steps
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n")}\n\nLet us know if any step doesn't work and we'll dig in, happy to help.`
}
function replyV3(t: Ticket): string {
  return t.steps.join(". ") + "."
}

// ---------------------------------------------------------------------------
// Rubric
// ---------------------------------------------------------------------------

const CRITERIA = [
  { name: "clarity", type: "ai_judge", weight: 0.5, config: { instructions: "Score how clearly the reply explains the resolution: concrete steps, correct order, no jargon left unexplained. 1.0 = a customer could follow it unaided; 0 = vague or confusing." } },
  { name: "acknowledges the customer", type: "contains", weight: 0.25, config: { substring: "thanks", caseSensitive: false } },
  { name: "offers follow-up", type: "regex", weight: 0.25, config: { pattern: "let us know|reach out|happy to help", flags: "i" } },
]
const PASS_THRESHOLD = 0.75

// Version quality profiles: clarity mean per (version, model) drives the story.
// v1 solid, v2 slightly better (structure), v3 clear-ish steps but fails both
// deterministic criteria → regression.
type Profile = { clarityMean: number; claritySpread: number; reply: (t: Ticket) => string; deterministicPass: number }
const PROFILES: Record<string, Profile> = {
  v1: { clarityMean: 0.84, claritySpread: 0.14, reply: replyV1, deterministicPass: 0.95 },
  v2: { clarityMean: 0.91, claritySpread: 0.09, reply: replyV2, deterministicPass: 1.0 },
  v3: { clarityMean: 0.78, claritySpread: 0.16, reply: replyV3, deterministicPass: 0.0 },
}

const quantize = (x: number) => Math.min(1, Math.max(0, Math.round(x * 20) / 20))

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
  if (!user) {
    throw new Error(
      "No User row found, sign in once (or insert your Clerk user) before seeding. The demo data needs an owner."
    )
  }
  console.log(`Seeding demo workspace for user ${user.username ?? user.id}`)

  // -- cleanup: remove a previous demo seed by its stable names ------------
  const oldPrompt = await prisma.prompt.findFirst({ where: { userId: user.id, title: PROMPT_TITLE } })
  const oldDataset = await prisma.dataset.findFirst({ where: { userId: user.id, name: DATASET_NAME } })
  if (oldPrompt) {
    await prisma.regressionRun.deleteMany({ where: { userId: user.id } })
    await prisma.baseline.deleteMany({ where: { promptId: oldPrompt.id } })
    await prisma.experimentResult.deleteMany({ where: { experiment: { userId: user.id, name: EXPERIMENT_NAME } } })
    await prisma.experiment.deleteMany({ where: { userId: user.id, name: EXPERIMENT_NAME } })
    await prisma.evaluation.deleteMany({ where: { promptRun: { promptId: oldPrompt.id } } })
    await prisma.promptRun.deleteMany({ where: { promptId: oldPrompt.id } })
    if (oldDataset) {
      await prisma.datasetRun.deleteMany({ where: { datasetId: oldDataset.id } })
      await prisma.datasetRow.deleteMany({ where: { datasetId: oldDataset.id } })
      await prisma.dataset.delete({ where: { id: oldDataset.id } })
    }
    await prisma.promptVersion.deleteMany({ where: { promptId: oldPrompt.id } })
    await prisma.prompt.delete({ where: { id: oldPrompt.id } })
  }
  await prisma.rubric.deleteMany({ where: { userId: user.id, name: RUBRIC_NAME } })
  await prisma.usageSummary.deleteMany({ where: { userId: user.id } })

  // -- prompt + versions ----------------------------------------------------
  const prompt = await prisma.prompt.create({
    data: {
      userId: user.id,
      title: PROMPT_TITLE,
      description: "Drafts replies to inbound support tickets for Acme Cloud.",
      tags: ["support", "triage", "production"],
      createdAt: daysAgo(21),
    },
  })
  const [v1, v2, v3] = await Promise.all([
    prisma.promptVersion.create({
      data: { promptId: prompt.id, versionNumber: 1, label: "baseline", systemPrompt: SYSTEM_V1, userPrompt: USER_PROMPT, variables: { question: TICKETS[0].question }, createdAt: daysAgo(21) },
    }),
    prisma.promptVersion.create({
      data: { promptId: prompt.id, versionNumber: 2, label: "structured + empathetic", systemPrompt: SYSTEM_V2, userPrompt: USER_PROMPT, variables: { question: TICKETS[0].question }, createdAt: daysAgo(12) },
    }),
    prisma.promptVersion.create({
      data: { promptId: prompt.id, versionNumber: 3, label: "terse rewrite", systemPrompt: SYSTEM_V3, userPrompt: USER_PROMPT, variables: { question: TICKETS[0].question }, createdAt: daysAgo(3) },
    }),
  ])

  // -- rubric ---------------------------------------------------------------
  const rubric = await prisma.rubric.create({
    data: {
      userId: user.id,
      name: RUBRIC_NAME,
      description: "LLM judge for clarity plus deterministic tone checks.",
      criteria: CRITERIA as unknown as Prisma.InputJsonValue,
      passThreshold: PASS_THRESHOLD,
      createdAt: daysAgo(20),
    },
  })

  // -- dataset ---------------------------------------------------------------
  const dataset = await prisma.dataset.create({
    data: {
      userId: user.id,
      name: DATASET_NAME,
      description: "Real-ish inbound tickets across billing, auth, API, and compliance.",
      columns: ["question"],
      rowCount: TICKETS.length,
      createdAt: daysAgo(19),
    },
  })
  const rows = await Promise.all(
    TICKETS.map((t, i) =>
      prisma.datasetRow.create({
        data: { datasetId: dataset.id, rowIndex: i, data: { question: t.question }, expectedOutput: t.expected },
      })
    )
  )

  // -- batch run factory ------------------------------------------------------
  async function seedDatasetRun(opts: {
    version: { id: string }
    profileKey: keyof typeof PROFILES
    model: (typeof MODELS)[keyof typeof MODELS]
    at: Date
    experimentId?: string
  }) {
    const profile = PROFILES[opts.profileKey]
    const run = await prisma.datasetRun.create({
      data: {
        userId: user!.id,
        datasetId: dataset.id,
        promptVersionId: opts.version.id,
        rubricId: rubric.id,
        model: opts.model.id,
        temperature: 0.7,
        maxTokens: 1024,
        variableMapping: { question: "question" },
        status: "running",
        totalRows: TICKETS.length,
        experimentId: opts.experimentId ?? null,
        createdAt: opts.at,
      },
    })

    const scores: number[] = []
    const latencies: number[] = []
    const failedRowIds: string[] = []
    let totalCost = 0

    for (let i = 0; i < TICKETS.length; i++) {
      const t = TICKETS[i]
      const responseText = profile.reply(t)
      const inputTokens = intBetween(170, 260)
      const outputTokens = Math.max(30, Math.round(responseText.length / 3.6))
      const latencyMs = intBetween(opts.model.latency[0], opts.model.latency[1])
      const costUsd = (inputTokens / 1e6) * opts.model.inPerM + (outputTokens / 1e6) * opts.model.outPerM
      const promptRun = await prisma.promptRun.create({
        data: {
          promptVersionId: opts.version.id,
          promptId: prompt.id,
          userId: user!.id,
          datasetRowId: rows[i].id,
          datasetRunId: run.id,
          model: opts.model.id,
          provider: opts.model.provider,
          temperature: 0.7,
          maxTokens: 1024,
          inputTokens,
          outputTokens,
          latencyMs,
          costUsd,
          responseText,
          finishReason: "stop",
          createdAt: new Date(opts.at.getTime() + i * 1500),
        },
      })

      const clarity = quantize(profile.clarityMean + (rand() * 2 - 1) * profile.claritySpread)
      const deterministic = rand() < profile.deterministicPass ? 1 : 0
      const criteriaScores = [
        { name: "clarity", type: "ai_judge", weight: 0.5, score: clarity, detail: clarity >= 0.8 ? "Steps are concrete, ordered, and self-sufficient." : "Steps are present but skip context a customer may need." },
        { name: "acknowledges the customer", type: "contains", weight: 0.25, score: deterministic, detail: deterministic ? `found "thanks"` : `substring "thanks" not found` },
        { name: "offers follow-up", type: "regex", weight: 0.25, score: deterministic, detail: deterministic ? "pattern matched" : "no follow-up offer matched" },
      ]
      const totalScore = Math.round((clarity * 0.5 + deterministic * 0.25 + deterministic * 0.25) * 1000) / 1000
      const passed = totalScore >= PASS_THRESHOLD
      if (!passed) failedRowIds.push(rows[i].id)
      const judgeIn = intBetween(420, 560)
      const judgeOut = intBetween(50, 90)
      const judgeCostUsd = (judgeIn / 1e6) * JUDGE.inPerM + (judgeOut / 1e6) * JUDGE.outPerM
      await prisma.evaluation.create({
        data: {
          promptRunId: promptRun.id,
          rubricId: rubric.id,
          userId: user!.id,
          status: "complete",
          totalScore,
          passed,
          criteriaScores: criteriaScores as unknown as Prisma.InputJsonValue,
          criteriaSnapshot: { rubricName: RUBRIC_NAME, passThreshold: PASS_THRESHOLD, criteria: CRITERIA } as unknown as Prisma.InputJsonValue,
          aiEvalReasoning:
            clarity >= 0.8
              ? "The reply resolves the ticket with specific, correctly ordered steps."
              : "The reply addresses the ticket but leaves at least one step underspecified.",
          evalMethod: "mixed",
          judgeModel: JUDGE.id,
          judgeInputTokens: judgeIn,
          judgeOutputTokens: judgeOut,
          judgeCostUsd,
          startedAt: new Date(opts.at.getTime() + i * 1500 + 400),
          completedAt: new Date(opts.at.getTime() + i * 1500 + 2400),
          createdAt: new Date(opts.at.getTime() + i * 1500 + 400),
        },
      })
      scores.push(totalScore)
      latencies.push(latencyMs)
      totalCost += costUsd + judgeCostUsd
    }

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.length > 1 ? scores.reduce((a, b) => a + (b - avg) ** 2, 0) / (scores.length - 1) : 0
    const passRate = scores.filter((s) => s >= PASS_THRESHOLD).length / scores.length
    const completedAt = new Date(opts.at.getTime() + TICKETS.length * 1500 + 4000)
    const updated = await prisma.datasetRun.update({
      where: { id: run.id },
      data: {
        status: "complete",
        completedRows: TICKETS.length,
        avgScore: Math.round(avg * 1000) / 1000,
        scoreVariance: Math.round(variance * 10000) / 10000,
        passRate,
        avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        totalCostUsd: Math.round(totalCost * 10000) / 10000,
        completedAt,
      },
    })
    return { run: updated, failedRowIds }
  }

  // -- baseline run (v1 × sonnet, 14 days ago) -------------------------------
  console.log("Seeding baseline dataset run…")
  const baselineRun = await seedDatasetRun({ version: v1, profileKey: "v1", model: MODELS.sonnet, at: daysAgo(14) })
  const baseline = await prisma.baseline.create({
    data: {
      userId: user.id,
      promptId: prompt.id,
      promptVersionId: v1.id,
      datasetId: dataset.id,
      rubricId: rubric.id,
      datasetRunId: baselineRun.run.id,
      baselineScore: baselineRun.run.avgScore!,
      baselinePassRate: baselineRun.run.passRate!,
      setAt: daysAgo(13),
    },
  })

  // -- experiment: v1 vs v2 × sonnet/gpt-4o (10 days ago) --------------------
  console.log("Seeding experiment (4 cells × 20 rows)…")
  const experiment = await prisma.experiment.create({
    data: {
      userId: user.id,
      name: EXPERIMENT_NAME,
      datasetId: dataset.id,
      rubricId: rubric.id,
      variantVersionIds: [v1.id, v2.id],
      models: [MODELS.sonnet.id, MODELS.gpt4o.id],
      status: "running",
      createdAt: daysAgo(10),
    },
  })
  const cells: Array<{ version: typeof v1; profileKey: keyof typeof PROFILES; model: (typeof MODELS)[keyof typeof MODELS] }> = [
    { version: v1, profileKey: "v1", model: MODELS.sonnet },
    { version: v1, profileKey: "v1", model: MODELS.gpt4o },
    { version: v2, profileKey: "v2", model: MODELS.sonnet },
    { version: v2, profileKey: "v2", model: MODELS.gpt4o },
  ]
  for (const cell of cells) {
    const seeded = await seedDatasetRun({ ...cell, at: daysAgo(10, 5), experimentId: experiment.id })
    await prisma.experimentResult.create({
      data: {
        experimentId: experiment.id,
        promptVersionId: cell.version.id,
        model: cell.model.id,
        datasetRunId: seeded.run.id,
        avgScore: seeded.run.avgScore,
        scoreVariance: seeded.run.scoreVariance,
        avgLatencyMs: seeded.run.avgLatencyMs,
        passRate: seeded.run.passRate,
        totalCostUsd: seeded.run.totalCostUsd,
        scoredRows: TICKETS.length,
        cellStatus: "complete",
      },
    })
  }
  await prisma.experiment.update({
    where: { id: experiment.id },
    data: { status: "complete", completedAt: daysAgo(10, 65) },
  })

  // -- regression history: v2 passes twice, v3 regresses ---------------------
  console.log("Seeding regression history…")
  const regressionChecks: Array<{ version: typeof v1; profileKey: keyof typeof PROFILES; at: Date }> = [
    { version: v2, profileKey: "v2", at: daysAgo(8) },
    { version: v2, profileKey: "v2", at: daysAgo(6) },
    { version: v3, profileKey: "v3", at: daysAgo(2) },
  ]
  const THRESHOLD = 0.05
  for (const check of regressionChecks) {
    const seeded = await seedDatasetRun({ version: check.version, profileKey: check.profileKey, model: MODELS.sonnet, at: check.at })
    const delta = seeded.run.avgScore! - baseline.baselineScore
    await prisma.regressionRun.create({
      data: {
        baselineId: baseline.id,
        userId: user.id,
        newVersionId: check.version.id,
        datasetRunId: seeded.run.id,
        status: "complete",
        newScore: seeded.run.avgScore,
        newPassRate: seeded.run.passRate,
        scoreDelta: Math.round(delta * 1000) / 1000,
        threshold: THRESHOLD,
        regressed: delta < -THRESHOLD,
        regressedRowIds: delta < -THRESHOLD ? seeded.failedRowIds : [],
        createdAt: check.at,
        completedAt: new Date(check.at.getTime() + 90 * 1000),
      },
    })
  }

  // -- a few manual (non-batch) runs for the prompt's run history ------------
  console.log("Seeding manual runs…")
  const manualSpecs = [
    { version: v1, profileKey: "v1" as const, model: MODELS.sonnet, at: daysAgo(18), ticket: TICKETS[0] },
    { version: v1, profileKey: "v1" as const, model: MODELS.gemini, at: daysAgo(17), ticket: TICKETS[1] },
    { version: v2, profileKey: "v2" as const, model: MODELS.gpt4o, at: daysAgo(11), ticket: TICKETS[2] },
    { version: v2, profileKey: "v2" as const, model: MODELS.sonnet, at: daysAgo(4), ticket: TICKETS[5] },
  ]
  for (const spec of manualSpecs) {
    const responseText = PROFILES[spec.profileKey].reply(spec.ticket)
    const inputTokens = intBetween(170, 260)
    const outputTokens = Math.max(30, Math.round(responseText.length / 3.6))
    await prisma.promptRun.create({
      data: {
        promptVersionId: spec.version.id,
        promptId: prompt.id,
        userId: user.id,
        model: spec.model.id,
        provider: spec.model.provider,
        temperature: 0.7,
        maxTokens: 1024,
        inputTokens,
        outputTokens,
        latencyMs: intBetween(spec.model.latency[0], spec.model.latency[1]),
        costUsd: (inputTokens / 1e6) * spec.model.inPerM + (outputTokens / 1e6) * spec.model.outPerM,
        responseText,
        finishReason: "stop",
        createdAt: spec.at,
      },
    })
  }

  // -- usage summaries + budget ----------------------------------------------
  console.log("Seeding usage history…")
  for (let d = 20; d >= 0; d--) {
    const busy = [14, 10, 8, 6, 2].includes(d)
    const totalRuns = busy ? intBetween(45, 130) : intBetween(3, 22)
    const totalInputTokens = totalRuns * intBetween(180, 240)
    const totalOutputTokens = totalRuns * intBetween(110, 190)
    await prisma.usageSummary.create({
      data: {
        userId: user.id,
        date: daysAgo(d),
        totalRuns,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd: Math.round(((totalInputTokens / 1e6) * 3 + (totalOutputTokens / 1e6) * 15) * 10000) / 10000,
      },
    })
  }
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { monthlyBudgetUsd: 25 },
    create: { userId: user.id, monthlyBudgetUsd: 25 },
  })

  console.log("Done. Demo workspace seeded:")
  console.log(`  prompt      ${prompt.id} (${PROMPT_TITLE}, v1–v3)`)
  console.log(`  dataset     ${dataset.id} (${TICKETS.length} rows)`)
  console.log(`  experiment  ${experiment.id}`)
  console.log(`  baseline    ${baseline.id} (score ${baseline.baselineScore})`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
