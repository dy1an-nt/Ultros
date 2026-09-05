import { Ajv } from "ajv"
import type {
  AiJudgeConfig,
  ContainsConfig,
  CriterionType,
  ExactConfig,
  JsonSchemaConfig,
  RegexConfig,
} from "@/types/eval"
import {
  ALLOWED_REGEX_FLAGS,
  MAX_EXPECTED_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_SCHEMA_BYTES,
  REGEX_INPUT_CAP,
} from "./limits"

// One entry per criterion type: how to validate its config, and how to score it
// when scoring does not need a judge model. Adding a criterion type is an entry
// here plus its config type in types/eval.ts, rather than a new arm in a
// validation switch and a second one in a scoring switch that can drift apart.

export type DeterministicResult = { score: 0 | 1; detail: string }

type CriterionHandler<C> = {
  // Validates an untrusted config object. Returns a field-specific message
  // rooted at `path`, or null when the config is well formed.
  validate: (config: Record<string, unknown>, path: string) => string | null
  // Absent for a type only a judge model can score.
  score?: (config: C, responseText: string) => DeterministicResult
}

type ConfigOf = {
  ai_judge: AiJudgeConfig
  exact: ExactConfig
  regex: RegexConfig
  json_schema: JsonSchemaConfig
  contains: ContainsConfig
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const CRITERION_HANDLERS: { [K in CriterionType]: CriterionHandler<ConfigOf[K]> } = {
  ai_judge: {
    validate: (config, path) => {
      const { instructions } = config as Partial<AiJudgeConfig>
      if (
        typeof instructions !== "string" ||
        instructions.length < 1 ||
        instructions.length > MAX_INSTRUCTIONS_LENGTH
      ) {
        return `${path}.config.instructions: must be a string of 1–${MAX_INSTRUCTIONS_LENGTH} characters`
      }
      return null
    },
    // No score: an ai_judge criterion is only ever settled by the judge model.
  },

  exact: {
    validate: (config, path) => {
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
    },
    score: (config, responseText) => {
      let actual = responseText
      let expected = config.expected
      if (config.trim) {
        actual = actual.trim()
        expected = expected.trim()
      }
      if (config.caseSensitive === false) {
        actual = actual.toLowerCase()
        expected = expected.toLowerCase()
      }
      return actual === expected
        ? { score: 1, detail: "exact match" }
        : { score: 0, detail: "response does not exactly match expected value" }
    },
  },

  regex: {
    validate: (config, path) => {
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
    },
    score: (config, responseText) => {
      let regex: RegExp
      try {
        regex = new RegExp(config.pattern, config.flags)
      } catch {
        return { score: 0, detail: "invalid regex pattern" }
      }
      // ReDoS mitigation: JS regexes have no timeout, so cap the input size.
      const input = responseText.slice(0, REGEX_INPUT_CAP)
      return regex.test(input)
        ? { score: 1, detail: "pattern matched" }
        : { score: 0, detail: "pattern did not match (first 100 KB of response)" }
    },
  },

  json_schema: {
    validate: (config, path) => {
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
    },
    score: (config, responseText) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(responseText)
      } catch {
        return { score: 0, detail: "response is not valid JSON" }
      }
      try {
        const ajv = new Ajv({ strict: false })
        const validate = ajv.compile(config.schema)
        if (validate(parsed)) return { score: 1, detail: "JSON matches schema" }
        const first = validate.errors?.[0]
        const detail = first
          ? `schema violation at ${first.instancePath || "/"}: ${first.message ?? "invalid"}`
          : "JSON does not match schema"
        return { score: 0, detail }
      } catch {
        return { score: 0, detail: "invalid JSON schema" }
      }
    },
  },

  contains: {
    validate: (config, path) => {
      const { substring, caseSensitive } = config as Partial<ContainsConfig>
      if (typeof substring !== "string" || substring.length < 1 || substring.length > MAX_EXPECTED_LENGTH) {
        return `${path}.config.substring: must be a string of 1–${MAX_EXPECTED_LENGTH} characters`
      }
      if (caseSensitive !== undefined && typeof caseSensitive !== "boolean") {
        return `${path}.config.caseSensitive: must be a boolean`
      }
      return null
    },
    score: (config, responseText) => {
      const haystack = config.caseSensitive === false ? responseText.toLowerCase() : responseText
      const needle = config.caseSensitive === false ? config.substring.toLowerCase() : config.substring
      return haystack.includes(needle)
        ? { score: 1, detail: "substring found" }
        : { score: 0, detail: "substring not found" }
    },
  },
}

// The catalog is the registry's key set, so a new entry is advertised
// everywhere the type list is used without a second list to update.
export const CRITERION_TYPES = Object.keys(CRITERION_HANDLERS) as CriterionType[]

export function isCriterionType(value: unknown): value is CriterionType {
  // hasOwn, not `in`: `in` walks the prototype chain, so "toString" and
  // "constructor" would pass and then resolve to a handler with no validate.
  return typeof value === "string" && Object.hasOwn(CRITERION_HANDLERS, value)
}
