"use client"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

type DailySummary = {
  date: string
  totalRuns: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
}

export function UsageChart({ daily }: { daily: DailySummary[] }) {
  const data = [...daily].reverse()

  if (data.length === 0) {
    return (
      <div className="border border-gray-800 rounded-lg p-4 bg-gray-900">
        <h3 className="text-sm font-medium mb-4 text-gray-300">Daily Cost (USD)</h3>
        <p className="text-sm text-gray-600">No usage data yet.</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-gray-900">
      <h3 className="text-sm font-medium mb-4 text-gray-300">Daily Cost (USD)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickFormatter={(v: number) => `$${v.toFixed(3)}`}
          />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6 }}
            labelStyle={{ color: "#d1d5db" }}
            formatter={(value) => {
              const num = typeof value === "number" ? value : 0
              return [`$${num.toFixed(6)}`, "Cost"]
            }}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Bar dataKey="totalCostUsd" fill="#6366f1" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
