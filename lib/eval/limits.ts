// Rubric validation limits, pinned by the Sprint 3 architect contract. Their
// own module because both sides of the boundary need them: the server
// validators in lib/eval and the rubric editor in components/eval, which must
// not pull Ajv into the client bundle to read a number.

export const MAX_CRITERIA = 20

export const MAX_REGEX_PATTERN_LENGTH = 500
export const ALLOWED_REGEX_FLAGS = "imsu"
export const MAX_SCHEMA_BYTES = 10 * 1024
export const MAX_EXPECTED_LENGTH = 10000
export const MAX_INSTRUCTIONS_LENGTH = 2000
export const MAX_CRITERION_NAME_LENGTH = 100
// ReDoS mitigation: regex matchers only see the first 100 KB of response text.
export const REGEX_INPUT_CAP = 100 * 1024
