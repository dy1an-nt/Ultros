import { auth } from "@clerk/nextjs/server"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit"

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

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  return Response.json({ data: await budgetStatus(user.id), error: null })
}

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return Response.json({ data: null, error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkId } })
  if (!user) return Response.json({ data: null, error: "User not found" }, { status: 404 })

  const limited = await checkRateLimit("mutation", user.id)
  if (!limited.ok) return rateLimitResponse(limited)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ data: null, error: "Invalid JSON body" }, { status: 400 })
  }

  const { monthlyBudgetUsd } = body
  if (monthlyBudgetUsd !== null) {
    if (
      typeof monthlyBudgetUsd !== "number" ||
      !Number.isFinite(monthlyBudgetUsd) ||
      monthlyBudgetUsd <= 0 ||
      monthlyBudgetUsd > MAX_BUDGET_USD
    ) {
      return Response.json(
        { data: null, error: `monthlyBudgetUsd must be null or a number between 0 and ${MAX_BUDGET_USD}` },
        { status: 400 }
      )
    }
  }

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, monthlyBudgetUsd: monthlyBudgetUsd as number | null },
    update: { monthlyBudgetUsd: monthlyBudgetUsd as number | null },
  })

  return Response.json({ data: await budgetStatus(user.id), error: null })
}
