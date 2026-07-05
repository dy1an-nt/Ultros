import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"
import type { Prisma } from "@/app/generated/prisma/client"
import { parseCsv, parseJsonRows } from "@/lib/datasets/parse"
import { errorResponse, jsonOk } from "@/lib/api/errors"

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const datasets = await prisma.dataset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  return jsonOk(datasets)
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  const raw = await req.text()
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return errorResponse("VALIDATION_ERROR", "payload too large (max 2 MB)")
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return errorResponse("INVALID_JSON")
  }

  const { name, description, csvText, rows } = body
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 100) {
    return errorResponse("VALIDATION_ERROR", "name: must be 1–100 chars")
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return errorResponse("VALIDATION_ERROR", "description: must be a string")
  }
  if ((csvText === undefined) === (rows === undefined)) {
    return errorResponse("VALIDATION_ERROR", "provide exactly one of csvText or rows")
  }

  const parsed =
    csvText !== undefined
      ? typeof csvText === "string"
        ? parseCsv(csvText)
        : { columns: null, rows: null, error: "csvText must be a string" }
      : parseJsonRows(rows)
  if (parsed.error !== null || parsed.columns === null || parsed.rows === null) {
    return errorResponse("VALIDATION_ERROR", parsed.error ?? "parse failed")
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

  return jsonOk(dataset, 201)
}
