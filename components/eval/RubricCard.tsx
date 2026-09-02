"use client"
import type { CriterionType, RubricDto } from "@/types/eval"

const TYPE_LABELS: Record<CriterionType, string> = {
  ai_judge: "AI Judge",
  exact: "Exact",
  regex: "Regex",
  json_schema: "JSON Schema",
  contains: "Contains",
}

type Props = {
  rubric: RubricDto
  onEdit: () => void
  onDelete: () => void
  deleting?: boolean
}

export function RubricCard({ rubric, onEdit, onDelete, deleting }: Props) {
  const totalWeight = rubric.criteria.reduce((sum, c) => sum + c.weight, 0)

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-gray-900 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{rubric.name}</h3>
          {rubric.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{rubric.description}</p>
          )}
        </div>
        <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded shrink-0">
          pass ≥ {(rubric.passThreshold * 100).toFixed(0)}%
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rubric.criteria.map((c) => (
          <span
            key={c.name}
            className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded"
            title={`${TYPE_LABELS[c.type]}, weight ${c.weight} (${
              totalWeight > 0 ? ((c.weight / totalWeight) * 100).toFixed(0) : 0
            }%)`}
          >
            {c.name} · {TYPE_LABELS[c.type]}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-800 pt-2 mt-auto">
        <span>
          {rubric.criteria.length} {rubric.criteria.length === 1 ? "criterion" : "criteria"}
        </span>
        <div className="flex gap-3">
          <button onClick={onEdit} className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-gray-500 hover:text-red-400 disabled:opacity-50 transition-colors"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  )
}
