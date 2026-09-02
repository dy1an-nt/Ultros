import { prisma } from "@/lib/prisma"

let seq = 0

// Users normally arrive via the Clerk webhook; tests insert the DB row
// directly and sign in with the matching clerkId.
export async function createUser(overrides: { clerkId?: string; username?: string } = {}) {
  seq += 1
  return prisma.user.create({
    data: {
      clerkId: overrides.clerkId ?? `clerk_test_${seq}`,
      username: overrides.username ?? `testuser${seq}`,
    },
  })
}

export async function createDataset(
  userId: string,
  overrides: { name?: string; rows?: { data: Record<string, string>; expectedOutput?: string | null }[] } = {}
) {
  const rows = overrides.rows ?? [
    { data: { question: "What is 2+2?" }, expectedOutput: "4" },
    { data: { question: "Capital of France?" }, expectedOutput: "Paris" },
  ]
  return prisma.dataset.create({
    data: {
      userId,
      name: overrides.name ?? "Test dataset",
      columns: Object.keys(rows[0].data),
      rowCount: rows.length,
      rows: {
        create: rows.map((row, rowIndex) => ({
          rowIndex,
          data: row.data,
          expectedOutput: row.expectedOutput ?? null,
        })),
      },
    },
    include: { rows: true },
  })
}

// Minimal terminal run. PromptVersionId has no FK, so a placeholder id is fine.
export async function createDatasetRun(userId: string, datasetId: string) {
  return prisma.datasetRun.create({
    data: {
      userId,
      datasetId,
      promptVersionId: "seed_version",
      model: "claude-sonnet-5",
      temperature: 0,
      maxTokens: 256,
      variableMapping: {},
      status: "complete",
      totalRows: 1,
    },
  })
}

// Prompt + version + one saved run, the unit a promptRun share points at.
export async function createPromptRun(userId: string) {
  const prompt = await createPrompt(userId)
  const version = prompt.versions[0]
  const run = await prisma.promptRun.create({
    data: {
      promptVersionId: version.id,
      promptId: prompt.id,
      userId,
      model: "claude-sonnet-5",
      provider: "anthropic",
      temperature: 0.7,
      maxTokens: 1024,
      inputTokens: 12,
      outputTokens: 34,
      latencyMs: 850,
      costUsd: 0.00123,
      responseText: "Hello, Ada!",
      finishReason: "stop",
    },
  })
  return { prompt, version, run }
}

export async function createEvaluation(userId: string, promptRunId: string) {
  return prisma.evaluation.create({
    data: {
      promptRunId,
      userId,
      status: "complete",
      totalScore: 0.9,
      passed: true,
      criteriaScores: [{ name: "Exact match", score: 0.9, passed: true, detail: "internal-only" }],
      criteriaSnapshot: { criteria: validCriteria, passThreshold: 0.7, rubricName: "Test rubric" },
      aiEvalReasoning: "Matched expectations.",
      evalMethod: "deterministic",
      completedAt: new Date(),
    },
  })
}

// Complete dataset run with one scored row and one unscored row (its eval is
// still pending), the fixture a datasetRun share resolves against.
export async function createScoredDatasetRun(userId: string) {
  const prompt = await createPrompt(userId, { title: "Batch prompt" })
  const version = prompt.versions[0]
  const dataset = await createDataset(userId, { name: "QA pairs" })
  const rubric = await createRubric(userId)
  const datasetRun = await prisma.datasetRun.create({
    data: {
      userId,
      datasetId: dataset.id,
      promptVersionId: version.id,
      rubricId: rubric.id,
      model: "claude-sonnet-5",
      temperature: 0,
      maxTokens: 256,
      variableMapping: { question: "question" },
      status: "complete",
      totalRows: 2,
      completedRows: 2,
      failedRows: 0,
      avgScore: 0.75,
      scoreVariance: 0.02,
      passRate: 0.5,
      avgLatencyMs: 400,
      totalCostUsd: 0.01,
      completedAt: new Date(),
    },
  })
  const runs = []
  for (const [i, row] of dataset.rows.entries()) {
    runs.push(
      await prisma.promptRun.create({
        data: {
          promptVersionId: version.id,
          promptId: prompt.id,
          userId,
          datasetRowId: row.id,
          datasetRunId: datasetRun.id,
          model: "claude-sonnet-5",
          provider: "anthropic",
          temperature: 0,
          maxTokens: 256,
          inputTokens: 10,
          outputTokens: 20,
          latencyMs: 400,
          costUsd: 0.005,
          responseText: `answer ${i}`,
        },
      })
    )
  }
  await createEvaluation(userId, runs[0].id)
  await prisma.evaluation.create({
    data: {
      promptRunId: runs[1].id,
      userId,
      status: "pending",
      criteriaSnapshot: { criteria: validCriteria, passThreshold: 0.7, rubricName: "Test rubric" },
      evalMethod: "deterministic",
    },
  })
  return { prompt, version, dataset, datasetRun, runs, rubric }
}

// Complete two-variant experiment. On model-a both cells scored (variant 2
// under the 10-row sample floor); on model-b variant 1 never scored, so that
// pair must not appear in the public win matrix.
export async function createExperiment(userId: string) {
  const prompt = await createPrompt(userId, { title: "Variant prompt" })
  const v1 = prompt.versions[0]
  const v2 = await prisma.promptVersion.create({
    data: { promptId: prompt.id, versionNumber: 2, userPrompt: "variant b", label: "variant-b" },
  })
  const experiment = await prisma.experiment.create({
    data: {
      userId,
      name: "A/B test",
      datasetId: "seed_dataset",
      rubricId: "seed_rubric",
      variantVersionIds: [v1.id, v2.id],
      models: ["model-a", "model-b"],
      status: "complete",
      completedAt: new Date(),
      results: {
        create: [
          {
            promptVersionId: v1.id,
            model: "model-a",
            datasetRunId: "seed_dsr_1",
            avgScore: 0.9,
            scoreVariance: 0.01,
            passRate: 1,
            avgLatencyMs: 300,
            totalCostUsd: 0.02,
            scoredRows: 12,
            cellStatus: "complete",
          },
          {
            promptVersionId: v2.id,
            model: "model-a",
            datasetRunId: "seed_dsr_2",
            avgScore: 0.7,
            scoreVariance: 0.03,
            passRate: 0.6,
            avgLatencyMs: 350,
            totalCostUsd: 0.02,
            scoredRows: 5,
            cellStatus: "complete",
          },
          {
            promptVersionId: v1.id,
            model: "model-b",
            datasetRunId: "seed_dsr_3",
            avgScore: null,
            totalCostUsd: 0,
            scoredRows: 0,
            cellStatus: "failed",
          },
          {
            promptVersionId: v2.id,
            model: "model-b",
            datasetRunId: "seed_dsr_4",
            avgScore: 0.8,
            totalCostUsd: 0.02,
            scoredRows: 12,
            cellStatus: "complete",
          },
        ],
      },
    },
  })
  return { prompt, v1, v2, experiment }
}

export async function createShare(
  userId: string,
  resourceType: string,
  resourceId: string,
  overrides: { revokedAt?: Date } = {}
) {
  seq += 1
  return prisma.share.create({
    data: {
      userId,
      token: `test_token_${seq}_${"x".repeat(20)}`,
      resourceType,
      resourceId,
      revokedAt: overrides.revokedAt ?? null,
    },
  })
}

export const validCriteria = [
  { name: "Exact match", type: "exact", weight: 60, config: { expected: "42" } },
  { name: "Mentions source", type: "contains", weight: 40, config: { substring: "source" } },
]

export async function createRubric(
  userId: string,
  overrides: { name?: string; criteria?: unknown[]; passThreshold?: number } = {}
) {
  return prisma.rubric.create({
    data: {
      userId,
      name: overrides.name ?? "Test rubric",
      criteria: (overrides.criteria ?? validCriteria) as object[],
      passThreshold: overrides.passThreshold ?? 0.7,
    },
  })
}

// UsageSummary row pinned daysAgo before today's UTC midnight, mirrors how
// the usage routes window on @db.Date values.
export async function createUsage(
  userId: string,
  daysAgo: number,
  overrides: Partial<{
    totalRuns: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCostUsd: number
  }> = {}
) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  date.setUTCHours(0, 0, 0, 0)
  return prisma.usageSummary.create({
    data: {
      userId,
      date,
      totalRuns: overrides.totalRuns ?? 1,
      totalInputTokens: overrides.totalInputTokens ?? 100,
      totalOutputTokens: overrides.totalOutputTokens ?? 200,
      totalCostUsd: overrides.totalCostUsd ?? 0.01,
    },
  })
}

export async function createPrompt(
  userId: string,
  overrides: { title?: string; deletedAt?: Date; userPrompt?: string } = {}
) {
  return prisma.prompt.create({
    data: {
      userId,
      title: overrides.title ?? "Test prompt",
      tags: [],
      deletedAt: overrides.deletedAt ?? null,
      versions: {
        create: {
          versionNumber: 1,
          systemPrompt: "",
          userPrompt: overrides.userPrompt ?? "Say hi to {{name}}",
        },
      },
    },
    include: { versions: true },
  })
}
