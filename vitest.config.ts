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
    // Component and hook suites sit next to what they cover and opt into jsdom
    // with a `@vitest-environment jsdom` docblock, so lib tests keep the
    // faster node environment. Route files stay excluded, they pull in the
    // Next runtime and are exercised through the integration suite instead.
    include: [
      "lib/**/*.test.ts",
      "tests/**/*.test.ts",
      "components/**/*.test.tsx",
      "hooks/**/*.test.tsx",
    ],
    // Integration suites need a real Postgres; they run via
    // vitest.integration.config.ts (`npm run test:integration`).
    exclude: [...configDefaults.exclude, "tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/**/index.ts"],
      // Ratchet, not target: pinned just under the current unit-suite numbers
      // so a change can only raise them. The unit suite owns lib's pure core;
      // IO modules are exercised (uninstrumented) by the integration suite,
      // which is why the statement floor looks low. Raise when coverage
      // grows; never lower.
      thresholds: { statements: 25, branches: 75, functions: 53, lines: 25 },
    },
  },
})
