import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // For migrations: direct connection (no pgbouncer)
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "",
  },
})
