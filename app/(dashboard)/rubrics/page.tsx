"use client"
import { useState } from "react"
import { useRubrics, useDeleteRubric } from "@/hooks/useRubrics"
import { RubricBuilder } from "@/components/eval/RubricBuilder"
import { RubricCard } from "@/components/eval/RubricCard"
import type { RubricDto } from "@/types/eval"

export default function RubricsPage() {
  const { data: rubrics, isLoading, error } = useRubrics()
  const deleteRubric = useDeleteRubric()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RubricDto | null>(null)

  const builderOpen = creating || editing !== null

  function handleDelete(rubric: RubricDto) {
    if (!window.confirm(`Delete rubric “${rubric.name}”? Past evaluations keep their snapshot.`)) {
      return
    }
    deleteRubric.mutate(rubric.id)
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Rubrics</h1>
        {!builderOpen && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            New Rubric
          </button>
        )}
      </div>

      {builderOpen && (
        <RubricBuilder
          key={editing?.id ?? "new"}
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}

      {deleteRubric.error && (
        <p className="text-sm text-red-400">Delete failed: {deleteRubric.error.message}</p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-400 py-4">Failed to load rubrics: {error.message}</div>
      ) : !rubrics || rubrics.length === 0 ? (
        !builderOpen && (
          <div className="text-center py-16 text-gray-600 text-sm">
            No rubrics yet — create one to start scoring your runs.
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rubrics.map((rubric) => (
            <RubricCard
              key={rubric.id}
              rubric={rubric}
              onEdit={() => {
                setCreating(false)
                setEditing(rubric)
              }}
              onDelete={() => handleDelete(rubric)}
              deleting={deleteRubric.isPending && deleteRubric.variables === rubric.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
