import { prisma } from "@/lib/prisma"
import { withUser, readJson } from "@/lib/api/handler"
import { ApiError, jsonOk } from "@/lib/api/errors"

const MAX_BUDGET_USD = 100000

// Month boundary in UTC, matching the UsageSummary daily rows.
function monthStartUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

async function budgetStatus(userId: string) {
  const [settings, monthRows] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.usageSummary.findMany({
      where: { userId, date: { gte: monthStartUtc() } },
      select: { totalCostUsd: true },
    }),
  ])
  const monthSpendUsd = monthRows.reduce((acc, r) => acc + r.totalCostUsd, 0)
  return {
    monthlyBudgetUsd: settings?.monthlyBudgetUsd ?? null,
    monthSpendUsd,
    monthStart: monthStartUtc().toISOString().split("T")[0],
  }
}

export const GET = withUser(async ({ user }) => {
  return jsonOk(await budgetStatus(user.id))
})

export const PATCH = withUser({ rateLimit: "mutation" }, async ({ req, user }) => {
  const body = await readJson(req)

  const { monthlyBudgetUsd } = body
  if (monthlyBudgetUsd !== null) {
    if (
      typeof monthlyBudgetUsd !== "number" ||
      !Number.isFinite(monthlyBudgetUsd) ||
      monthlyBudgetUsd <= 0 ||
      monthlyBudgetUsd > MAX_BUDGET_USD
    ) {
      throw new ApiError(
        "VALIDATION_ERROR",
        `monthlyBudgetUsd must be null or a positive number up to ${MAX_BUDGET_USD}`
      )
    }
  }

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, monthlyBudgetUsd: monthlyBudgetUsd as number | null },
    update: { monthlyBudgetUsd: monthlyBudgetUsd as number | null },
  })

  return jsonOk(await budgetStatus(user.id))
})
