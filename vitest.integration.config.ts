import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Integration suite: imports route handlers directly and runs them against a
// real, disposable Postgres (local Homebrew instance or the CI service).
// Every table is truncated before each test, so this config refuses to point
// anywhere but localhost, see tests/integration/helpers/env.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    // Order matters: env must point at the test DB before tests/setup.ts's
    // `??=` fallbacks run and before any module imports lib/prisma.
    setupFiles: [
      "./tests/integration/setup-env.ts",
      "./tests/setup.ts",
      "./tests/integration/setup.ts",
    ],
    globalSetup: ["./tests/integration/global-setup.ts"],
    // Suites share one database and truncate between tests. Files must not
    // run concurrently.
    fileParallelism: false,
  },
})
