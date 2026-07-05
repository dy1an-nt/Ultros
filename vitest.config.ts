import { configDefaults, defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Vitest resolves the `@/` alias the same way tsconfig's paths do, so test
// files import app modules with the identical specifier the app uses.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Unit + integration suites live next to the code (lib) and under tests/.
    // App route/component files are excluded — they pull in Next runtime and
    // are exercised through the integration suite, not as bare imports.
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // Integration suites need a real Postgres; they run via
    // vitest.integration.config.ts (`npm run test:integration`).
    exclude: [...configDefaults.exclude, "tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/**/index.ts"],
    },
  },
})
