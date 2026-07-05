import { describe, it, expect } from "vitest"
import { GET, POST } from "@/app/api/datasets/route"
import { signInAs } from "../helpers/clerk"
import { prisma } from "../helpers/db"
import { createUser, createDataset } from "../helpers/seed"
import { jsonRequest, rawRequest } from "../helpers/request"

describe("GET /api/datasets", () => {
  it("returns 401 when signed out", async () => {
    expect((await GET()).status).toBe(401)
  })

  it("returns only the caller's datasets", async () => {
    const me = await createUser()
    const other = await createUser()
    const mine = await createDataset(me.id, { name: "Mine" })
    await createDataset(other.id, { name: "Theirs" })

    signInAs(me.clerkId)
    const { data } = await (await GET()).json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe(mine.id)
  })
})

describe("POST /api/datasets", () => {
  it("returns 401 when signed out", async () => {
    const res = await POST(jsonRequest("POST", "/api/datasets", { name: "x", csvText: "a\n1" }))
    expect(res.status).toBe(401)
  })

  it("rejects a missing name with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(jsonRequest("POST", "/api/datasets", { csvText: "a\n1" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain("name")
  })

  it("rejects providing both csvText and rows with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(
      jsonRequest("POST", "/api/datasets", { name: "x", csvText: "a\n1", rows: [{ a: "1" }] })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("provide exactly one of csvText or rows")
  })

  it("rejects providing neither csvText nor rows with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(jsonRequest("POST", "/api/datasets", { name: "x" }))
    expect(res.status).toBe(400)
  })

  it("rejects a payload over 2 MB with 400 before parsing", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(
      jsonRequest("POST", "/api/datasets", { name: "big", csvText: "a\n" + "x".repeat(2 * 1024 * 1024) })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("payload too large (max 2 MB)")
  })

  it("surfaces a CSV parse failure as 400 and persists nothing", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    // duplicate header — papaparse would silently rename it
    const res = await POST(jsonRequest("POST", "/api/datasets", { name: "dupes", csvText: "a,a\n1,2" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toContain("duplicate column")
    expect(await prisma.dataset.count()).toBe(0)
  })

  it("creates a dataset from CSV, splitting expectedOutput out of the columns", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const csvText = "question,expectedOutput\nWhat is 2+2?,4\nCapital of France?,Paris"
    const res = await POST(jsonRequest("POST", "/api/datasets", { name: "  QA set  ", csvText }))
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.name).toBe("QA set") // trimmed
    expect(data.columns).toEqual(["question"])
    expect(data.rowCount).toBe(2)

    const rows = await prisma.datasetRow.findMany({
      where: { datasetId: data.id },
      orderBy: { rowIndex: "asc" },
    })
    expect(rows.map((r) => r.expectedOutput)).toEqual(["4", "Paris"])
    expect(rows[0].data).toEqual({ question: "What is 2+2?" })
  })

  it("creates a dataset from JSON rows, unioning columns with empty-string fill", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(
      jsonRequest("POST", "/api/datasets", {
        name: "Union",
        rows: [{ a: "1" }, { a: "2", b: "3" }],
      })
    )
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.columns).toEqual(["a", "b"])

    const rows = await prisma.datasetRow.findMany({
      where: { datasetId: data.id },
      orderBy: { rowIndex: "asc" },
    })
    expect(rows[0].data).toEqual({ a: "1", b: "" })
    expect(rows[1].data).toEqual({ a: "2", b: "3" })
  })

  it("rejects a malformed JSON body with 400", async () => {
    const user = await createUser()
    signInAs(user.clerkId)
    const res = await POST(rawRequest("POST", "/api/datasets", "{nope"))
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe("Request body is not valid JSON")
  })
})
