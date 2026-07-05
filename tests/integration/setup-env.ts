import { testDatabaseUrl } from "./helpers/env"

// First setup file: point everything at the disposable test database before
// tests/setup.ts applies its `??=` fallbacks and before any test file imports
// a module that constructs the Prisma pool (lib/prisma.ts connects on first
// import).
const url = testDatabaseUrl()
process.env.DATABASE_URL = url
process.env.DIRECT_URL = url
process.env.DB_PASSWORD ??= "postgres"
process.env.PGSSLMODE = "disable"

// No accidental network traffic from rate limiting or error reporting: with
// Upstash unset, checkRateLimit fails open; Sentry is mocked in setup.ts.
delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN
delete process.env.SENTRY_DSN
delete process.env.NEXT_PUBLIC_SENTRY_DSN
