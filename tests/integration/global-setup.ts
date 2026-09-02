import { execSync } from "node:child_process"
import { testDatabaseUrl } from "./helpers/env"

// Runs once per suite invocation, in its own process: applies every migration
// to the (localhost-only) test database so handlers exercise the same schema
// production runs. prisma.config.ts loads .env.local via dotenv, but dotenv
// never overrides variables that are already set, the URLs passed here win.
export default function globalSetup() {
  const url = testDatabaseUrl()
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      DB_PASSWORD: process.env.DB_PASSWORD ?? "postgres",
      PGSSLMODE: "disable",
    },
  })
}
