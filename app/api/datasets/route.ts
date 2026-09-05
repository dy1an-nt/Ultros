import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { parseCsv, parseJsonRows } from "@/lib/datasets/parse"
import { withUser } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024

export const GET = withUser(async ({ db }) => {
  return jsonOk(await db.dataset.list())
})

export const POST = withUser({ rateLimit: "mutation" }, async ({ req, user }) => {
  // Read as text first: the size gate has to run before the parse, so this
  // route cannot use the shared readJson helper.
  const raw = await req.text()
  if (raw.length > MAX_PAYLOAD_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "payload too large (max 2 MB)")
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    throw new ApiError("INVALID_JSON")
  }

  const { name, description, csvText, rows } = body
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 100) {
    throw new ApiError("VALIDATION_ERROR", "name: must be 1–100 chars")
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    throw new ApiError("VALIDATION_ERROR", "description: must be a string")
  }
  if ((csvText === undefined) === (rows === undefined)) {
    throw new ApiError("VALIDATION_ERROR", "provide exactly one of csvText or rows")
  }

  const parsed =
    csvText !== undefined
      ? typeof csvText === "string"
        ? parseCsv(csvText)
        : { columns: null, rows: null, error: "csvText must be a string" }
      : parseJsonRows(rows)
  if (parsed.error !== null || parsed.columns === null || parsed.rows === null) {
    throw new ApiError("VALIDATION_ERROR", parsed.error ?? "parse failed")
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
})
