-- CreateTable
CREATE TABLE "UsageSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "UsageSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageSummary_userId_idx" ON "UsageSummary"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageSummary_userId_date_key" ON "UsageSummary"("userId", "date");

-- AddForeignKey
ALTER TABLE "UsageSummary" ADD CONSTRAINT "UsageSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
