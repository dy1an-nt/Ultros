"use client"
import { useState } from "react"
import type { RubricDto } from "@/types/eval"
import { useCreateRubric, useUpdateRubric } from "@/hooks/useRubrics"
import {
  CriterionEditor,
  criterionToDraft,
  draftToCriterion,
  emptyCriterionDraft,
  validateCriterionDraft,
  type CriterionDraft,
} from "@/components/eval/CriterionEditor"

const MAX_CRITERIA = 20

type Props = {
  initial?: RubricDto // present → edit mode, absent → create mode
  onClose: () => void
}

export function RubricBuilder({ initial, onClose }: Props) {
  const createRubric = useCreateRubric()
  const updateRubric = useUpdateRubric()
  const mutation = initial ? updateRubric : createRubric

  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [passThreshold, setPassThreshold] = useState(initial?.passThreshold ?? 0.7)
  const [drafts, setDrafts] = useState<CriterionDraft[]>(() =>
    initial ? initial.criteria.map(criterionToDraft) : [emptyCriterionDraft()]
  )
  const [submitted, setSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const totalWeight = drafts.reduce((sum, d) => {
    const w = Number(d.weight)
    return Number.isFinite(w) && w > 0 ? sum + w : sum
  }, 0)

  const criterionErrors = drafts.map((d) => validateCriterionDraft(d))

  function rubricError(): string | null {
    const trimmed = name.trim()
    if (!trimmed) return "Rubric name is required"
    if (trimmed.length > 100) return "Rubric name must be at most 100 characters"
    if (drafts.length < 1) return "At least one criterion is required"
    if (drafts.length > MAX_CRITERIA) return `At most ${MAX_CRITERIA} criteria allowed`
    if (passThreshold < 0 || passThreshold > 1) return "Pass threshold must be between 0 and 1"
    const names = drafts.map((d) => d.name.trim()).filter(Boolean)
    if (new Set(names).size !== names.length) return "Criterion names must be unique"
    return null
  }

  function handleSave() {
    setSubmitted(true)
    const topError = rubricError()
    if (topError || criterionErrors.some((e) => e !== null)) {
      setFormError(topError)
      return
    }
    setFormError(null)
    const payload = {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      passThreshold,
      criteria: drafts.map(draftToCriterion),
    }
    if (initial) {
      updateRubric.mutate({ id: initial.id, ...payload }, { onSuccess: onClose })
    } else {
      createRubric.mutate(payload, { onSuccess: onClose })
    }
  }

  function updateDraft(index: number, next: CriterionDraft) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? next : d)))
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index))
  }

  const inputClass =
    "w-full text-sm border border-gray-700 rounded px-2 py-1.5 bg-gray-950 text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"

  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-gray-900 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          {initial ? `Edit rubric — ${initial.name}` : "New rubric"}
        </h2>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Name</label>
          <input
            className={inputClass}
            placeholder="e.g. Support reply quality"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Description (optional)</label>
          <input
            className={inputClass}
            placeholder="What this rubric measures"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">
          Pass threshold —{" "}
          <span className="text-indigo-400 font-medium">{(passThreshold * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={passThreshold}
          onChange={(e) => setPassThreshold(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-500">
            Criteria ({drafts.length}/{MAX_CRITERIA}) — weight share shown per row
          </label>
          <button
            onClick={() => setDrafts((prev) => [...prev, emptyCriterionDraft()])}
            disabled={drafts.length >= MAX_CRITERIA}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            + Add criterion
          </button>
        </div>
        {drafts.length === 0 && (
          <p className="text-sm text-gray-600 text-center py-4">
            No criteria — add at least one to save this rubric.
          </p>
        )}
        <div className="space-y-2">
          {drafts.map((draft, i) => (
            <CriterionEditor
              key={draft.key}
              draft={draft}
              weightShare={totalWeight > 0 ? Number(draft.weight) / totalWeight : NaN}
              error={submitted ? criterionErrors[i] : null}
              onChange={(next) => updateDraft(i, next)}
              onRemove={() => removeDraft(i)}
            />
          ))}
        </div>
      </div>

      {submitted && formError && <p className="text-sm text-red-400">{formError}</p>}
      {mutation.error && <p className="text-sm text-red-400">{mutation.error.message}</p>}

      <div className="flex justify-end gap-2 pt-1 border-t border-gray-800">
        <button
          onClick={onClose}
          className="mt-3 px-3 py-1.5 text-sm rounded text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="mt-3 px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? "Saving…" : initial ? "Save changes" : "Create rubric"}
        </button>
      </div>
    </div>
  )
}
