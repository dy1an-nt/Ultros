-- AlterTable
ALTER TABLE "PromptRun" ADD COLUMN     "datasetRowId" TEXT,
ADD COLUMN     "datasetRunId" TEXT;

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "columns" TEXT[],
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRow" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "expectedOutput" TEXT,

    CONSTRAINT "DatasetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "rubricId" TEXT,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "variableMapping" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "completedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION,
    "scoreVariance" DOUBLE PRECISION,
    "passRate" DOUBLE PRECISION,
    "avgLatencyMs" INTEGER,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "experimentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DatasetRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dataset_userId_idx" ON "Dataset"("userId");

-- CreateIndex
CREATE INDEX "DatasetRow_datasetId_idx" ON "DatasetRow"("datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRow_datasetId_rowIndex_key" ON "DatasetRow"("datasetId", "rowIndex");

-- CreateIndex
CREATE INDEX "DatasetRun_userId_idx" ON "DatasetRun"("userId");

-- CreateIndex
CREATE INDEX "DatasetRun_datasetId_idx" ON "DatasetRun"("datasetId");

-- CreateIndex
CREATE INDEX "PromptRun_datasetRunId_idx" ON "PromptRun"("datasetRunId");

-- AddForeignKey
ALTER TABLE "PromptRun" ADD CONSTRAINT "PromptRun_datasetRowId_fkey" FOREIGN KEY ("datasetRowId") REFERENCES "DatasetRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptRun" ADD CONSTRAINT "PromptRun_datasetRunId_fkey" FOREIGN KEY ("datasetRunId") REFERENCES "DatasetRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRow" ADD CONSTRAINT "DatasetRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRun" ADD CONSTRAINT "DatasetRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
