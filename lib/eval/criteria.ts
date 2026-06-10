import { Ajv } from "ajv"
import type {
  AiJudgeConfig,
  ContainsConfig,
  Criterion,
  CriterionType,
  ExactConfig,
  JsonSchemaConfig,
  RegexConfig,
} from "@/types/eval"

// Validation limits pinned by the Sprint 3 architect contract.
export const MAX_CRITERIA = 20
export const MAX_REGEX_PATTERN_LENGTH = 500
export const ALLOWED_REGEX_FLAGS = "imsu"
export const MAX_SCHEMA_BYTES = 10 * 1024
export const MAX_EXPECTED_LENGTH = 10000
export const MAX_INSTRUCTIONS_LENGTH = 2000
export const MAX_CRITERION_NAME_LENGTH = 100
// ReDoS mitigation: regex matchers only see the first 100 KB of response text.
export const REGEX_INPUT_CAP = 100 * 1024

const CRITERION_TYPES: CriterionType[] = ["ai_judge", "exact", "regex", "json_schema", "contains"]

type ValidationResult = { criteria: Criterion[]; error: null } | { criteria: null; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateConfig(type: CriterionType, config: Record<string, unknown>, path: string): string | null {
  switch (type) {
    case "ai_judge": {
      const { instructions } = config as Partial<AiJudgeConfig>
      if (
        typeof instructions !== "string" ||
        instructions.length < 1 ||
        instructions.length > MAX_INSTRUCTIONS_LENGTH
      ) {
        return `${path}.config.instructions: must be a string of 1–${MAX_INSTRUCTIONS_LENGTH} characters`
      }
      return null
    }
    case "exact": {
      const { expected, caseSensitive, trim } = config as Partial<ExactConfig>
      if (typeof expected !== "string" || expected.length < 1 || expected.length > MAX_EXPECTED_LENGTH) {
        return `${path}.config.expected: must be a string of 1–${MAX_EXPECTED_LENGTH} characters`
      }
      if (caseSensitive !== undefined && typeof caseSensitive !== "boolean") {
        return `${path}.config.caseSensitive: must be a boolean`
      }
      if (trim !== undefined && typeof trim !== "boolean") {
        return `${path}.config.trim: must be a boolean`
      }
      return null
    }
    case "regex": {
      const { pattern, flags } = config as Partial<RegexConfig>
      if (typeof pattern !== "string" || pattern.length < 1 || pattern.length > MAX_REGEX_PATTERN_LENGTH) {
        return `${path}.config.pattern: must be a string of 1–${MAX_REGEX_PATTERN_LENGTH} characters`
      }
      if (flags !== undefined) {
        if (typeof flags !== "string" || [...flags].some((f) => !ALLOWED_REGEX_FLAGS.includes(f))) {
          return `${path}.config.flags: only flags "${ALLOWED_REGEX_FLAGS}" are allowed`
        }
      }
      try {
        new RegExp(pattern, flags)
      } catch {
        return `${path}.config.pattern: invalid regex`
      }
      return null
    }
    case "json_schema": {
      const { schema } = config as Partial<JsonSchemaConfig>
      if (!isPlainObject(schema)) {
        return `${path}.config.schema: must be a JSON schema object`
      }
      let serialized: string
      try {
        serialized = JSON.stringify(schema)
      } catch {
        return `${path}.config.schema: must be JSON-serializable`
      }
      if (serialized.length > MAX_SCHEMA_BYTES) {
        return `${path}.config.schema: serialized schema must be at most 10 KB`
      }
      try {
        const ajv = new Ajv({ strict: false })
        ajv.compile(schema)
      } catch {
        return `${path}.config.schema: invalid JSON schema`
      }
      return null
    }
    case "contains": {
      const { substring, caseSensitive } = config as Partial<ContainsConfig>
      if (typeof substring !== "string" || substring.length < 1 || substring.length > MAX_EXPECTED_LENGTH) {
        return `${path}.config.substring: must be a string of 1–${MAX_EXPECTED_LENGTH} characters`
      }
      if (caseSensitive !== undefined && typeof caseSensitive !== "boolean") {
        return `${path}.config.caseSensitive: must be a boolean`
      }
      return null
    }
  }
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

    if (typeof type !== "string" || !CRITERION_TYPES.includes(type as CriterionType)) {
      return { criteria: null, error: `${path}.type: must be one of ${CRITERION_TYPES.join(", ")}` }
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
      return { criteria: null, error: `${path}.weight: must be a number > 0 and <= 100` }
    }
    if (!isPlainObject(config)) {
      return { criteria: null, error: `${path}.config: must be an object` }
    }

    const configError = validateConfig(type as CriterionType, config, path)
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
  if (typeof input !== "string" || input.trim().length < 1 || input.length > 200) {
    return { value: null, error: "name: must be a string of 1–200 characters" }
  }
  return { value: input.trim(), error: null }
}
