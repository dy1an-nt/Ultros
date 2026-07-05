import { describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/experiments/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import {
  createUser,
  createDataset,
  createDatasetRun,
  createRubric,
  createPrompt,
  createExperiment,
} from "../helpers/seed"
import { jsonRequest } from "../helpers/request"

function post(body: unknown) {
  return POST(jsonRequest("POST", "/api/experiments", body))
}

// Real dataset (columns: ["question"]), rubric, and a prompt whose template
// variable matches the dataset column — the identity mapping succeeds.
async function launchFixtures(userId: string) {
  const dataset = await createDataset(userId)
  const rubric = await createRubric(userId)
  const prompt = await createPrompt(userId, { userPrompt: "Answer: {{question}}" })
  return { dataset, rubric, prompt, version: prompt.versions[0] }
}

function validBody(f: Awaited<ReturnType<typeof launchFixtures>>) {
  return {
    confirm: true,
    name: "My experiment",
    datasetId: f.dataset.id,
    rubricId: f.rubric.id,
    variantVersionIds: [f.version.id],
    models: ["claude-haiku-4-5"],
  }
}

describe("GET /api/experiments", () => {
  it("returns 401 when signed out", async () => {
    expect((await GET()).status).toBe(401)
  })

  it("lists only the caller's experiments with cell progress counts", async () => {
    const me = await createUser()
    const other = await createUser()
    const { experiment } = await createExperiment(me.id)
    await createExperiment(other.id)
    // one terminal cell out of the 2 variants × 2 models = 4
    const dataset = await createDataset(me.id)
    const cell = await createDatasetRun(me.id, dataset.id)
    await prisma.datasetRun.update({ where: { id: cell.id }, data: { experimentId: experiment.id } })

    signInAs(me.clerkId)
    const { data } = await (await GET()).json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe(experiment.id)
    expect(data[0].cellsTotal).toBe(4)
    expect(data[0].cellsTerminal).toBe(1)
  })
})

describe("POST /api/experiments", () => {
  it("returns 401 when signed out", async () => {
    expect((await post({ confirm: true })).status).toBe(401)
  })

  it("refuses to launch without confirm: true — cost fan-outs must be deliberate", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    signInAs(user.clerkId)

    const res = await post({ ...validBody(f), confirm: undefined })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("confirm")
    expect(await prisma.experiment.count()).toBe(0)
  })

  it("rejects a missing name with 400", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    signInAs(user.clerkId)
    expect((await post({ ...validBody(f), name: "  " })).status).toBe(400)
  })

  it("rejects another user's dataset as 'invalid datasetId' — same as nonexistent", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const theirs = await createDataset(owner.id)
    const f = await launchFixtures(intruder.id)

    signInAs(intruder.clerkId)
    const res = await post({ ...validBody(f), datasetId: theirs.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid datasetId")

    const missing = await post({ ...validBody(f), datasetId: "ghost" })
    expect((await missing.json()).error).toBe("invalid datasetId")
  })

  it("rejects another user's rubric with 400", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const theirs = await createRubric(owner.id)
    const f = await launchFixtures(intruder.id)

    signInAs(intruder.clerkId)
    const res = await post({ ...validBody(f), rubricId: theirs.id })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid rubricId")
  })

  it("rejects duplicate variant version ids with 400", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    signInAs(user.clerkId)
    const res = await post({ ...validBody(f), variantVersionIds: [f.version.id, f.version.id] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("variantVersionIds contains duplicates")
  })

  it("rejects another user's version as 'invalid variantVersionIds'", async () => {
    const owner = await createUser()
    const intruder = await createUser()
    const theirPrompt = await createPrompt(owner.id, { userPrompt: "Answer: {{question}}" })
    const f = await launchFixtures(intruder.id)

    signInAs(intruder.clerkId)
    const res = await post({ ...validBody(f), variantVersionIds: [theirPrompt.versions[0].id] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid variantVersionIds")
  })

  it("rejects variants drawn from two different prompts", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    const otherPrompt = await createPrompt(user.id, { userPrompt: "Other: {{question}}" })

    signInAs(user.clerkId)
    const res = await post({
      ...validBody(f),
      variantVersionIds: [f.version.id, otherPrompt.versions[0].id],
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("all variant versions must belong to the same prompt")
  })

  it("rejects an unknown model with 400", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    signInAs(user.clerkId)
    const res = await post({ ...validBody(f), models: ["gpt-99-ultra"] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Unknown model: gpt-99-ultra")
  })

  it("caps maxTokens at the dataset-run limit, below the single-run limit", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    signInAs(user.clerkId)
    // 8192 passes general run validation; the batch cap is 4096
    const res = await post({ ...validBody(f), maxTokens: 8192 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("maxTokens must be at most 4096 for dataset runs")
  })

  it("rejects a variant whose template variable has no dataset column", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    // default createPrompt userPrompt uses {{name}}; dataset has only "question"
    const mismatched = await createPrompt(user.id)

    signInAs(user.clerkId)
    const res = await post({ ...validBody(f), variantVersionIds: [mismatched.versions[0].id] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("version 1: unmapped template variables: name")
  })

  it("launches with 202: one pending DatasetRun cell per variant × model", async () => {
    const user = await createUser()
    const f = await launchFixtures(user.id)
    const v2 = await prisma.promptVersion.create({
      data: { promptId: f.prompt.id, versionNumber: 2, userPrompt: "Reply: {{question}}" },
    })

    signInAs(user.clerkId)
    const res = await post({ ...validBody(f), variantVersionIds: [f.version.id, v2.id] })
    expect(res.status).toBe(202)
    const { data } = await res.json()
    expect(data.status).toBe("running")
    expect(data.cells).toHaveLength(2)

    const cells = await prisma.datasetRun.findMany({ where: { experimentId: data.id } })
    expect(cells).toHaveLength(2)
    expect(new Set(cells.map((c) => c.promptVersionId))).toEqual(new Set([f.version.id, v2.id]))
    for (const cell of cells) {
      expect(cell.status).toBe("pending") // fan-out is stubbed; nothing ran
      expect(cell.totalRows).toBe(2)
      expect(cell.variableMapping).toEqual({ question: "question" })
      expect(cell.rubricId).toBe(f.rubric.id)
    }
  })
})
