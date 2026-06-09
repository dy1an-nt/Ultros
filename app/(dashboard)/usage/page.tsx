"use client"
import { useUsage } from "@/hooks/useUsage"
import { UsageSummaryCards } from "@/components/usage/UsageSummaryCards"
import { UsageChart } from "@/components/usage/UsageChart"

export default function UsagePage() {
  const { data, isLoading, error } = useUsage(30)

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading usage…</div>
  }
  if (error || !data) {
    return <div className="p-6 text-red-400">Failed to load usage data.</div>
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-white">Usage</h1>
      <UsageSummaryCards {...data.summary} />
      <UsageChart daily={data.daily} />
    </div>
  )
}
