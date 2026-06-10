import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/app/generated/prisma/client"
import { parseCsv, parseJsonRows } from "@/lib/datasets/parse"

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const datasets = await prisma.dataset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  return Response.json({ data: datasets, error: null })
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const raw = await req.text()
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return Response.json({ data: null, error: "payload too large (max 2 MB)" }, { status: 400 })
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const { name, description, csvText, rows } = body
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 100) {
    return Response.json({ data: null, error: "name: must be 1–100 chars" }, { status: 400 })
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return Response.json({ data: null, error: "description: must be a string" }, { status: 400 })
  }
  if ((csvText === undefined) === (rows === undefined)) {
    return Response.json({ data: null, error: "provide exactly one of csvText or rows" }, { status: 400 })
  }

  const parsed =
    csvText !== undefined
      ? typeof csvText === "string"
        ? parseCsv(csvText)
        : { columns: null, rows: null, error: "csvText must be a string" }
      : parseJsonRows(rows)
  if (parsed.error !== null || parsed.columns === null || parsed.rows === null) {
    return Response.json({ data: null, error: parsed.error ?? "parse failed" }, { status: 400 })
  }
  const { columns, rows: parsedRows } = parsed

  const dataset = await prisma.$transaction(async (tx) => {
    const created = await tx.dataset.create({
      data: {
        userId: user.id,
        name: name.trim(),
        description: (description as string | null | undefined) ?? null,
        columns,
        rowCount: parsedRows.length,
      },
    })
    await tx.datasetRow.createMany({
      data: parsedRows.map((row, rowIndex) => ({
        datasetId: created.id,
        rowIndex,
        data: row.data as Prisma.InputJsonValue,
        expectedOutput: row.expectedOutput,
      })),
    })
    return created
  })

  return Response.json({ data: dataset, error: null }, { status: 201 })
}
