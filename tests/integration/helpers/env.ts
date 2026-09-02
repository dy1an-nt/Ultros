import { userInfo } from "node:os"

// Resolves the integration-test database URL. CI sets TEST_DATABASE_URL to
// the service container; local runs default to the developer's Postgres with
// OS-user trust auth. The password travels separately as DB_PASSWORD, same as
// the app (lib/prisma.ts never reads it from the URL).
//
// Hard guard: the suite TRUNCATEs every table between tests, so any host
// other than localhost is refused outright, a stray DATABASE_URL pointing at
// Supabase must never reach the truncate.
export function testDatabaseUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ??
    `postgresql://${userInfo().username}@localhost:5432/ultros_test`
  const host = new URL(url).hostname
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(
      `Integration tests truncate every table and refuse to run against non-local host "${host}". ` +
        `Point TEST_DATABASE_URL at a disposable localhost database.`
    )
  }
  return url
}
