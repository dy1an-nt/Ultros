import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api/errors"

// Spreadsheet formula-injection guard, same rule as the dataset-run export.
function guardCell(value: string): string {
  const needsQuote = /^[=+\-@]/.test(value)
  const guarded = needsQuote ? `'${value}` : value
  return `"${guarded.replace(/"/g, '""')}"`
}

function parseDay(value: string | null): Date | null | undefined {
  if (value === null) return undefined // not provided
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null // invalid
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const from = parseDay(req.nextUrl.searchParams.get("from"))
  const to = parseDay(req.nextUrl.searchParams.get("to"))
  if (from === null || to === null) {
    return errorResponse("VALIDATION_ERROR", "from/to must be YYYY-MM-DD")
  }

  const rows = await prisma.usageSummary.findMany({
    where: {
      userId: user.id,
      ...(from || to ? { date: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
    },
    orderBy: { date: "asc" },
  })

  const header = ["date", "runs", "inputTokens", "outputTokens", "costUsd"]
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        guardCell(r.date.toISOString().split("T")[0]),
        String(r.totalRuns),
        String(r.totalInputTokens),
        String(r.totalOutputTokens),
        r.totalCostUsd.toFixed(6),
      ].join(",")
    ),
  ]

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ultros-usage.csv"`,
    },
  })
}
