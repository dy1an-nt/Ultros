import { prisma } from "@/lib/prisma"

export { prisma }

// Truncate every application table (CASCADE covers FK order) so each test
// starts from an empty database. _prisma_migrations survives. The schema is
// applied once in global-setup.
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(", ")
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`)
}
