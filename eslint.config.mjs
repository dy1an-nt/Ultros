import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client — not hand-written source.
    "app/generated/**",
    // Tooling-only: agent worktrees and local Claude state (not app source).
    ".claude/**",
    // Vendored design mockups / documentation assets, not part of the build.
    "docs/**",
  ]),
  {
    // The React Compiler advisory rules (new in this eslint-config-next) flag
    // render-purity / effect style across pre-existing UI that predates them.
    // Keep them visible as warnings so they're reported and can be paid down,
    // but don't let pre-existing advisories block the CI lint gate. Real
    // correctness rules stay at "error".
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
