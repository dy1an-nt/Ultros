-- AlterTable
-- Lease timestamp for QStash eval-job idempotency. A worker stamps "startedAt"
-- when it claims a job; a fresh stamp blocks a concurrent duplicate delivery
-- from re-claiming the same evaluation, while an expired stamp lets a crashed
-- job be retried. Nullable so existing rows backfill as "never claimed".
ALTER TABLE "Evaluation" ADD COLUMN     "startedAt" TIMESTAMP(3);
