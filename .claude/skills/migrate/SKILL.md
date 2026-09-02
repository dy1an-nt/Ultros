---
name: migrate
description: Author and apply an Ultros database migration through Prisma Migrate. Use whenever a schema change is needed (new model/field/constraint/index) or when migrations must be applied to local, CI, or the Supabase production database, for example "add a migration", "run migrations", or "deploy the schema change". Never edit an applied migration and never hand-edit the production schema in the Supabase SQL editor.
---

# Database migrations

Schema lives in `prisma/schema.prisma`. Every change ships as a timestamped
directory under `prisma/migrations/`, applied in name order by Prisma Migrate,
which records each one in `_prisma_migrations` so it runs exactly once.
**Never edit a migration that has been applied anywhere: add a new one.**
Prisma Migrate is forward-only in production: roll back with a compensating
migration, or restore from a Supabase backup for destructive mistakes.

The Prisma CLI reads `prisma.config.ts`, which loads `.env.local` and rebuilds
the connection string from `DIRECT_URL` (or `DATABASE_URL`) plus `DB_PASSWORD`.
`DIRECT_URL` must be the direct Postgres connection, port 5432, not the pooled
one; migrations against the pooler fail in confusing ways.

## Authoring

1. Edit `prisma/schema.prisma` first. The schema is the source of truth; the SQL
   is generated from it.
2. Generate the migration and review the SQL before it runs anywhere else:

```bash
npx prisma migrate dev --name <short_snake_case_description>
```

3. Read the generated `prisma/migrations/<timestamp>_<name>/migration.sql`
   line by line. Prisma will happily emit a destructive statement.
4. Additive first. A new required column on a populated table needs a default,
   or a three-step expand, backfill, contract sequence across separate
   migrations. The running deployment must survive the window between the
   migration landing and the new code deploying.
5. Sharp edges that have bitten this repo before:
   - A unique constraint added to an existing table fails if the data already
     violates it. Check with a query before writing the migration.
   - Job-claim columns like `Evaluation.startedAt` back the QStash idempotency
     lease. Changing their nullability changes retry behavior; see
     `lib/eval/runEvalJob.ts` before touching them.
   - Anything storing money stays a float USD `costUsd`, tokens stay integers,
     latency stays integer milliseconds.

## Applying

```bash
npx prisma migrate status     # applied vs pending, and drift
npx prisma migrate deploy     # apply pending migrations, no schema edits
npx prisma generate           # regenerate the client after any schema change
```

`migrate dev` is for local development only. It can reset the database. Never
run it against production or against a database you care about.

Production order: confirm a recent Supabase backup exists, `migrate status`,
`migrate deploy`, `migrate status` again (expect zero pending and no drift),
then deploy the code that depends on the schema.

CI already applies every migration in order against a clean `ultros_test`
Postgres (`.github/workflows/ci.yml`), so a migration that cannot replay from
empty fails the build. The integration suite's global setup runs
`migrate deploy` itself, so `npm run test:integration` is also a real check
that the migration applies.

## Reporting

If the migration has not yet been applied to an environment, the task summary
says so in its own paragraph, every time, even if it came up earlier in the
session.
