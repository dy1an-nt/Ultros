"use client"
import Link from "next/link"
import { useExperiments } from "@/hooks/useExperiments"

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-blue-900 text-blue-300",
    complete: "bg-green-900 text-green-300",
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  )
}

export default function ExperimentsPage() {
  const { data: experiments, isLoading, error } = useExperiments()

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Experiments</h1>
        <Link
          href="/experiments/new"
          className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          New Experiment
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-400 py-4">Failed to load experiments: {error.message}</div>
      ) : !experiments || experiments.length === 0 ? (
        <div className="text-center py-16 text-gray-600 text-sm">
          No experiments yet — compare prompt variants across models on a dataset.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {experiments.map((experiment) => (
            <Link
              key={experiment.id}
              href={`/experiments/${experiment.id}`}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-2 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-white font-medium">{experiment.name}</span>
                <StatusBadge status={experiment.status} />
              </div>
              <p className="text-xs text-gray-600">
                {experiment.variantVersionIds.length} variants × {experiment.models.length} models ·{" "}
                {experiment.cellsTerminal}/{experiment.cellsTotal} cells done
              </p>
              <p className="text-xs text-gray-600">
                {new Date(experiment.createdAt).toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
