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

// Minimal terminal run — promptVersionId has no FK, so a placeholder id is fine.
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

export async function createRubric(userId: string, overrides: { name?: string } = {}) {
  return prisma.rubric.create({
    data: {
      userId,
      name: overrides.name ?? "Test rubric",
      criteria: validCriteria,
      passThreshold: 0.7,
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
