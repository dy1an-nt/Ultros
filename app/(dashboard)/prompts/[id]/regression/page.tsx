"use client"
import { use } from "react"
import Link from "next/link"
import { useBaseline, useRegressionHistory } from "@/hooks/useRegression"
import { BaselineCard } from "@/components/regression/BaselineCard"
import { RegressionTrigger } from "@/components/regression/RegressionTrigger"
import { RegressionResult } from "@/components/regression/RegressionResult"
import { ScoreOverTimeChart } from "@/components/regression/ScoreOverTimeChart"

export default function RegressionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: baseline } = useBaseline(id)
  const history = useRegressionHistory(id)

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href={`/prompts/${id}`} className="text-sm text-gray-500 hover:text-gray-300">
          ← Prompt
        </Link>
        <h1 className="text-2xl font-bold text-white">Regression testing</h1>
      </div>

      <BaselineCard promptId={id} />

      {baseline && <RegressionTrigger promptId={id} baseline={baseline} />}

      {baseline &&
        (history.isLoading ? (
          <div className="h-40 bg-gray-800 rounded-lg animate-pulse" />
        ) : history.error ? (
          <div className="text-sm text-red-400">Failed to load history: {history.error.message}</div>
        ) : history.data ? (
          <>
            <ScoreOverTimeChart history={history.data} />
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-white">History</h2>
              <RegressionResult history={history.data} />
            </div>
          </>
        ) : null)}
    </div>
  )
}
