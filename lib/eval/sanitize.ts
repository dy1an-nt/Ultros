// Pure, IO-free secret scrubbing — kept separate from runEvalJob (which pulls
// in Prisma) so it is unit-testable without a DB. Provider error messages can
// echo request headers; never persist or log an API key.
const SECRET_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENROUTER_API_KEY",
  "UPSTASH_QSTASH_TOKEN",
] as const

export function sanitizeErrorMessage(message: string): string {
  let sanitized = message
  for (const envKey of SECRET_ENV_KEYS) {
    const value = process.env[envKey]
    if (value) sanitized = sanitized.split(value).join("[redacted]")
  }
  return sanitized.slice(0, 2000)
}
