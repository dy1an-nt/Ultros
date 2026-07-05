import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { errorResponse, jsonOk } from "@/lib/api/errors"

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return errorResponse("UNAUTHORIZED")

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return errorResponse("NOT_FOUND", "User not found")

  const daysParam = req.nextUrl.searchParams.get("days")
  const days = daysParam ? parseInt(daysParam, 10) : 30
  if (isNaN(days) || days < 1 || days > 90) {
    return errorResponse("VALIDATION_ERROR", "days must be between 1 and 90")
  }

  // days=1 means "today only", so look back days-1 from today's UTC midnight
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - (days - 1))
  since.setUTCHours(0, 0, 0, 0)

  const rows = await prisma.usageSummary.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: { date: "desc" },
  })

  const summary = rows.reduce(
    (acc, r) => ({
      totalRuns: acc.totalRuns + r.totalRuns,
      totalInputTokens: acc.totalInputTokens + r.totalInputTokens,
      totalOutputTokens: acc.totalOutputTokens + r.totalOutputTokens,
      totalCostUsd: acc.totalCostUsd + r.totalCostUsd,
    }),
    { totalRuns: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0 }
  )

  const daily = rows.map((r) => ({
    date: r.date.toISOString().split("T")[0],
    totalRuns: r.totalRuns,
    totalInputTokens: r.totalInputTokens,
    totalOutputTokens: r.totalOutputTokens,
    totalCostUsd: r.totalCostUsd,
  }))

  return jsonOk({ summary, daily })
}
