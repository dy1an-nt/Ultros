type Props = {
  totalRuns: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
}

export function UsageSummaryCards({
  totalRuns,
  totalInputTokens,
  totalOutputTokens,
  totalCostUsd,
}: Props) {
  const cards = [
    { label: "Total Runs", value: totalRuns.toLocaleString() },
    { label: "Input Tokens", value: totalInputTokens.toLocaleString() },
    { label: "Output Tokens", value: totalOutputTokens.toLocaleString() },
    { label: "Total Cost", value: `$${totalCostUsd.toFixed(4)}` },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="border border-gray-800 rounded-lg p-4 bg-gray-900">
          <p className="text-xs text-gray-500">{card.label}</p>
          <p className="text-2xl font-bold mt-1 text-white">{card.value}</p>
        </div>
      ))}
    </div>
  )
}
