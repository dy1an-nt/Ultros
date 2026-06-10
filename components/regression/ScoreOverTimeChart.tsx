"use client"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"
import type { RegressionHistoryDto } from "@/types/experiment"

// Score over time: one point per completed regression run, oldest → newest,
// with the baseline score as the reference line.
export function ScoreOverTimeChart({ history }: { history: RegressionHistoryDto }) {
  const points = [...history.runs]
    .filter((r) => r.status === "complete" && r.newScore !== null)
    .reverse()
    .map((r) => ({
      label: `v${r.versionNumber ?? "?"} · ${new Date(r.createdAt).toLocaleDateString()}`,
      score: r.newScore as number,
      regressed: r.regressed === true,
    }))

  if (points.length === 0) {
    return (
      <div className="border border-gray-800 rounded-lg p-4 bg-gray-900">
        <h3 className="text-sm font-medium mb-4 text-gray-300">Score over time</h3>
        <p className="text-sm text-gray-600">No completed regression runs yet.</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-gray-900">
      <h3 className="text-sm font-medium mb-4 text-gray-300">Score over time</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: "#6b7280" }} />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6 }}
            labelStyle={{ color: "#d1d5db" }}
            formatter={(value) => {
              const num = typeof value === "number" ? value : 0
              return [num.toFixed(3), "Score"]
            }}
          />
          {history.baseline && (
            <ReferenceLine
              y={history.baseline.baselineScore}
              stroke="#6366f1"
              strokeDasharray="4 4"
              label={{
                value: `baseline ${history.baseline.baselineScore.toFixed(3)}`,
                fill: "#818cf8",
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 4, fill: "#22c55e" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
