import { Ajv } from "ajv"
import type {
  ContainsConfig,
  Criterion,
  CriterionScore,
  ExactConfig,
  JsonSchemaConfig,
  RegexConfig,
} from "@/types/eval"
import { REGEX_INPUT_CAP } from "./criteria"

function scoreExact(config: ExactConfig, responseText: string): { score: 0 | 1; detail: string } {
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
}

function scoreRegex(config: RegexConfig, responseText: string): { score: 0 | 1; detail: string } {
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
}

function scoreJsonSchema(config: JsonSchemaConfig, responseText: string): { score: 0 | 1; detail: string } {
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
    const detail = first ? `schema violation at ${first.instancePath || "/"}: ${first.message ?? "invalid"}` : "JSON does not match schema"
    return { score: 0, detail }
  } catch {
    return { score: 0, detail: "invalid JSON schema" }
  }
}

function scoreContains(config: ContainsConfig, responseText: string): { score: 0 | 1; detail: string } {
  const haystack = config.caseSensitive === false ? responseText.toLowerCase() : responseText
  const needle = config.caseSensitive === false ? config.substring.toLowerCase() : config.substring
  return haystack.includes(needle)
    ? { score: 1, detail: "substring found" }
    : { score: 0, detail: "substring not found" }
}

// Runs a single deterministic criterion against the response text.
// Deterministic matchers produce exactly 0 or 1 per the contract.
export function runDeterministicCriterion(criterion: Criterion, responseText: string): CriterionScore {
  let result: { score: 0 | 1; detail: string }
  switch (criterion.type) {
    case "exact":
      result = scoreExact(criterion.config as ExactConfig, responseText)
      break
    case "regex":
      result = scoreRegex(criterion.config as RegexConfig, responseText)
      break
    case "json_schema":
      result = scoreJsonSchema(criterion.config as JsonSchemaConfig, responseText)
      break
    case "contains":
      result = scoreContains(criterion.config as ContainsConfig, responseText)
      break
    case "ai_judge":
      throw new Error("ai_judge criteria are not deterministic")
  }
  return {
    name: criterion.name,
    type: criterion.type,
    weight: criterion.weight,
    score: result.score,
    detail: result.detail,
  }
}

// totalScore = Σ(weightᵢ × scoreᵢ) / Σ(weightᵢ) — weighted mean in [0, 1].
export function computeTotalScore(scores: CriterionScore[]): number {
  const weightSum = scores.reduce((acc, s) => acc + s.weight, 0)
  if (weightSum === 0) return 0
  const weighted = scores.reduce((acc, s) => acc + s.weight * s.score, 0)
  return weighted / weightSum
}
