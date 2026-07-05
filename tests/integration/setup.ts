import { vi, beforeEach } from "vitest"
import { authState, signOut } from "./helpers/clerk"
import { resetDb } from "./helpers/db"

// Clerk is the only auth boundary the handlers see; everything below it —
// user lookup, isolation checks, Prisma — runs for real. `auth()` resolves to
// whatever identity the current test set via signInAs().
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: authState.clerkId }),
  currentUser: async () =>
    authState.clerkId ? { id: authState.clerkId } : null,
}))

// lib/rateLimit imports Sentry at module load; stub it so a fail-open report
// never attempts network IO from a test run.
vi.mock("@sentry/nextjs", () => ({
  captureException: () => undefined,
}))

// Dev-mode dataset-run fan-out defers row jobs via after(), which throws
// outside a real Next request scope — and the jobs would call AI providers.
// Stubbing it keeps launches observable (DatasetRuns persist as "pending")
// while the work itself never runs. Everything else in next/server is real.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return { ...actual, after: () => undefined }
})

beforeEach(async () => {
  await resetDb()
  signOut()
})
