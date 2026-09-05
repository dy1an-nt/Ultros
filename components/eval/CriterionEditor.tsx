"use client"
import type {
  AiJudgeConfig,
  ContainsConfig,
  Criterion,
  CriterionType,
  ExactConfig,
  JsonSchemaConfig,
  RegexConfig,
} from "@/types/eval"
import {
  ALLOWED_REGEX_FLAGS,
  MAX_CRITERION_NAME_LENGTH,
  MAX_EXPECTED_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_SCHEMA_BYTES,
} from "@/lib/eval/limits"

// Local editing shape: flat so fields survive type switches and the JSON-schema
// textarea can hold not-yet-valid JSON. Converted to the shared `Criterion`
// contract type only on save (draftToCriterion).
export type CriterionDraft = {
  key: string
  name: string
  type: CriterionType
  weight: string
  instructions: string
  expected: string
  caseSensitive: boolean
  trim: boolean
  pattern: string
  flags: string
  schemaText: string
  substring: string
}

let draftSeq = 0
function nextKey(): string {
  draftSeq += 1
  return `criterion-${draftSeq}`
}

export function emptyCriterionDraft(): CriterionDraft {
  return {
    key: nextKey(),
    name: "",
    type: "contains",
    weight: "1",
    instructions: "",
    expected: "",
    caseSensitive: false,
    trim: true,
    pattern: "",
    flags: "",
    schemaText: "{}",
    substring: "",
  }
}

export function criterionToDraft(criterion: Criterion): CriterionDraft {
  const cfg = criterion.config as Partial<
    AiJudgeConfig & ExactConfig & RegexConfig & JsonSchemaConfig & ContainsConfig
  >
  return {
    key: nextKey(),
    name: criterion.name,
    type: criterion.type,
    weight: String(criterion.weight),
    instructions: cfg.instructions ?? "",
    expected: cfg.expected ?? "",
    caseSensitive: cfg.caseSensitive ?? false,
    trim: cfg.trim ?? true,
    pattern: cfg.pattern ?? "",
    flags: cfg.flags ?? "",
    schemaText: cfg.schema ? JSON.stringify(cfg.schema, null, 2) : "{}",
    substring: cfg.substring ?? "",
  }
}

const FLAGS_PATTERN = new RegExp(`^[${ALLOWED_REGEX_FLAGS}]*$`)

// Same limits the server enforces, imported rather than copied, with messages
// written for someone filling in the form instead of reading an API response.
export function validateCriterionDraft(draft: CriterionDraft): string | null {
  const name = draft.name.trim()
  if (!name) return "Name is required"
  if (name.length > MAX_CRITERION_NAME_LENGTH) {
    return `Name must be at most ${MAX_CRITERION_NAME_LENGTH} characters`
  }
  const weight = Number(draft.weight)
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return "Weight must be greater than 0 and at most 100"
  }
  switch (draft.type) {
    case "ai_judge":
      if (!draft.instructions.trim()) return "Judge instructions are required"
      if (draft.instructions.length > MAX_INSTRUCTIONS_LENGTH) {
        return `Instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters`
      }
      return null
    case "exact":
      if (draft.expected.length < 1) return "Expected value is required"
      if (draft.expected.length > MAX_EXPECTED_LENGTH) {
        return `Expected value must be at most ${MAX_EXPECTED_LENGTH} characters`
      }
      return null
    case "regex": {
      if (!draft.pattern) return "Pattern is required"
      if (draft.pattern.length > MAX_REGEX_PATTERN_LENGTH) {
        return `Pattern must be at most ${MAX_REGEX_PATTERN_LENGTH} characters`
      }
      if (!FLAGS_PATTERN.test(draft.flags)) {
        return `Flags may only include ${[...ALLOWED_REGEX_FLAGS].join(", ")}`
      }
      try {
        new RegExp(draft.pattern, draft.flags)
      } catch {
        return "Pattern is not a valid regular expression"
      }
      return null
    }
    case "json_schema": {
      if (draft.schemaText.length > MAX_SCHEMA_BYTES) return "Schema must be at most 10 KB"
      let parsed: unknown
      try {
        parsed = JSON.parse(draft.schemaText)
      } catch {
        return "Schema must be valid JSON"
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "Schema must be a JSON object"
      }
      return null
    }
    case "contains":
      if (draft.substring.length < 1) return "Substring is required"
      if (draft.substring.length > MAX_EXPECTED_LENGTH) {
        return `Substring must be at most ${MAX_EXPECTED_LENGTH} characters`
      }
      return null
  }
}

// Only call after validateCriterionDraft returns null.
export function draftToCriterion(draft: CriterionDraft): Criterion {
  const base = { name: draft.name.trim(), type: draft.type, weight: Number(draft.weight) }
  switch (draft.type) {
    case "ai_judge":
      return { ...base, config: { instructions: draft.instructions } }
    case "exact":
      return {
        ...base,
        config: { expected: draft.expected, caseSensitive: draft.caseSensitive, trim: draft.trim },
      }
    case "regex":
      return {
        ...base,
        config: draft.flags
          ? { pattern: draft.pattern, flags: draft.flags }
          : { pattern: draft.pattern },
      }
    case "json_schema":
      return { ...base, config: { schema: JSON.parse(draft.schemaText) as Record<string, unknown> } }
    case "contains":
      return {
        ...base,
        config: { substring: draft.substring, caseSensitive: draft.caseSensitive },
      }
  }
}

const TYPE_LABELS: Record<CriterionType, string> = {
  ai_judge: "AI Judge",
  exact: "Exact Match",
  regex: "Regex",
  json_schema: "JSON Schema",
  contains: "Contains",
}

const inputClass =
  "w-full text-sm border border-gray-700 rounded px-2 py-1.5 bg-gray-950 text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-indigo-500"
      />
      {label}
    </label>
  )
}

type Props = {
  draft: CriterionDraft
  weightShare: number // 0–1 share of total rubric weight
  error: string | null
  onChange: (next: CriterionDraft) => void
  onRemove: () => void
}

export function CriterionEditor({ draft, weightShare, error, onChange, onRemove }: Props) {
  const set = (patch: Partial<CriterionDraft>) => onChange({ ...draft, ...patch })

  return (
    <div className="border border-gray-800 rounded-lg p-3 bg-gray-950 space-y-3">
      <div className="flex items-center gap-2">
        <input
          className={inputClass}
          placeholder="Criterion name"
          value={draft.name}
          maxLength={100}
          onChange={(e) => set({ name: e.target.value })}
        />
        <select
          className="text-sm border border-gray-700 rounded px-2 py-1.5 bg-gray-950 text-gray-100 shrink-0"
          value={draft.type}
          onChange={(e) => set({ type: e.target.value as CriterionType })}
        >
          {(Object.keys(TYPE_LABELS) as CriterionType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="w-20 text-sm border border-gray-700 rounded px-2 py-1.5 bg-gray-950 text-gray-100 shrink-0"
          title="Weight (> 0, ≤ 100)"
          min={0}
          max={100}
          step="any"
          value={draft.weight}
          onChange={(e) => set({ weight: e.target.value })}
        />
        <span className="text-xs text-gray-500 w-12 text-right shrink-0">
          {Number.isFinite(weightShare) ? `${(weightShare * 100).toFixed(0)}%` : "N/A"}
        </span>
        <button
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors text-sm shrink-0"
          title="Remove criterion"
        >
          ✕
        </button>
      </div>

      {draft.type === "ai_judge" && (
        <div className="space-y-1">
          <textarea
            className={`${inputClass} font-mono min-h-[72px]`}
            placeholder="Judge instructions, e.g. “Score 1 if the reply is polite and empathetic, 0 if rude.”"
            value={draft.instructions}
            maxLength={2000}
            onChange={(e) => set({ instructions: e.target.value })}
          />
          <p className="text-xs text-gray-600 text-right">{draft.instructions.length}/2000</p>
        </div>
      )}

      {draft.type === "exact" && (
        <div className="space-y-2">
          <input
            className={`${inputClass} font-mono`}
            placeholder="Expected output (exact match)"
            value={draft.expected}
            onChange={(e) => set({ expected: e.target.value })}
          />
          <div className="flex gap-4">
            <Checkbox
              label="Case sensitive"
              checked={draft.caseSensitive}
              onChange={(v) => set({ caseSensitive: v })}
            />
            <Checkbox label="Trim whitespace" checked={draft.trim} onChange={(v) => set({ trim: v })} />
          </div>
        </div>
      )}

      {draft.type === "regex" && (
        <div className="flex gap-2">
          <input
            className={`${inputClass} font-mono`}
            placeholder="Pattern (max 500 chars)"
            value={draft.pattern}
            maxLength={500}
            onChange={(e) => set({ pattern: e.target.value })}
          />
          <input
            className="w-24 text-sm border border-gray-700 rounded px-2 py-1.5 bg-gray-950 text-gray-100 font-mono shrink-0"
            placeholder="flags"
            title="Flags: subset of i m s u"
            value={draft.flags}
            maxLength={4}
            onChange={(e) => set({ flags: e.target.value })}
          />
        </div>
      )}

      {draft.type === "json_schema" && (
        <textarea
          className={`${inputClass} font-mono min-h-[96px]`}
          placeholder='JSON schema, e.g. { "type": "object", "required": ["answer"] }'
          value={draft.schemaText}
          onChange={(e) => set({ schemaText: e.target.value })}
        />
      )}

      {draft.type === "contains" && (
        <div className="space-y-2">
          <input
            className={`${inputClass} font-mono`}
            placeholder="Substring the response must contain"
            value={draft.substring}
            onChange={(e) => set({ substring: e.target.value })}
          />
          <Checkbox
            label="Case sensitive"
            checked={draft.caseSensitive}
            onChange={(v) => set({ caseSensitive: v })}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
