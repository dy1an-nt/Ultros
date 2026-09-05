import type { Criterion, CriterionType } from "@/types/eval"
import { CRITERION_HANDLERS, CRITERION_TYPES, isCriterionType } from "./criterionTypes"
import { MAX_CRITERIA, MAX_CRITERION_NAME_LENGTH } from "./limits"

// Rubric-level validation: the shape of the criteria array itself. Everything
// specific to one criterion type lives in ./criterionTypes.

// Re-exported so the limits keep one import path across the codebase.
export {
  ALLOWED_REGEX_FLAGS,
  MAX_CRITERIA,
  MAX_CRITERION_NAME_LENGTH,
  MAX_EXPECTED_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_SCHEMA_BYTES,
  REGEX_INPUT_CAP,
} from "./limits"

type ValidationResult = { criteria: Criterion[]; error: null } | { criteria: null; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Validates an untrusted criteria payload. Returns the typed array or a
// field-specific error message (e.g. "criteria[0].config.pattern: invalid regex").
export function validateCriteria(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return { criteria: null, error: "criteria: must be an array" }
  }
  if (input.length < 1 || input.length > MAX_CRITERIA) {
    return { criteria: null, error: `criteria: must contain 1–${MAX_CRITERIA} criteria` }
  }

  const seenNames = new Set<string>()
  const criteria: Criterion[] = []

  for (let i = 0; i < input.length; i++) {
    const path = `criteria[${i}]`
    const raw = input[i]
    if (!isPlainObject(raw)) {
      return { criteria: null, error: `${path}: must be an object` }
    }
    const { name, type, weight, config } = raw

    if (typeof name !== "string" || name.trim().length < 1 || name.length > MAX_CRITERION_NAME_LENGTH) {
      return { criteria: null, error: `${path}.name: must be a string of 1–${MAX_CRITERION_NAME_LENGTH} characters` }
    }
    if (seenNames.has(name)) {
      return { criteria: null, error: `${path}.name: duplicate criterion name "${name}"` }
    }
    seenNames.add(name)

    if (!isCriterionType(type)) {
      return { criteria: null, error: `${path}.type: must be one of ${CRITERION_TYPES.join(", ")}` }
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
      return { criteria: null, error: `${path}.weight: must be a number > 0 and <= 100` }
    }
    if (!isPlainObject(config)) {
      return { criteria: null, error: `${path}.config: must be an object` }
    }

    const configError = CRITERION_HANDLERS[type].validate(config, path)
    if (configError) return { criteria: null, error: configError }

    criteria.push({ name, type: type as CriterionType, weight, config } as Criterion)
  }

  return { criteria, error: null }
}

export function validatePassThreshold(input: unknown): { value: number; error: null } | { value: null; error: string } {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 1) {
    return { value: null, error: "passThreshold: must be a number between 0 and 1" }
  }
  return { value: input, error: null }
}

export function validateRubricName(input: unknown): { value: string; error: null } | { value: null; error: string } {
  // 100 matches the client-side cap (Sprint 3 QA: stricter side wins).
  if (typeof input !== "string" || input.trim().length < 1 || input.length > 100) {
    return { value: null, error: "name: must be a string of 1–100 characters" }
  }
  return { value: input.trim(), error: null }
}
