-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "variantVersionIds" TEXT[],
    "models" TEXT[],
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentResult" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "datasetRunId" TEXT NOT NULL,
    "avgScore" DOUBLE PRECISION,
    "scoreVariance" DOUBLE PRECISION,
    "avgLatencyMs" INTEGER,
    "passRate" DOUBLE PRECISION,
    "totalCostUsd" DOUBLE PRECISION NOT NULL,
    "scoredRows" INTEGER NOT NULL,
    "cellStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "datasetRunId" TEXT NOT NULL,
    "baselineScore" DOUBLE PRECISION NOT NULL,
    "baselinePassRate" DOUBLE PRECISION NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionRun" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newVersionId" TEXT NOT NULL,
    "datasetRunId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "newScore" DOUBLE PRECISION,
    "newPassRate" DOUBLE PRECISION,
    "scoreDelta" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION NOT NULL,
    "regressed" BOOLEAN,
    "regressedRowIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RegressionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Experiment_userId_idx" ON "Experiment"("userId");

-- CreateIndex
CREATE INDEX "ExperimentResult_experimentId_idx" ON "ExperimentResult"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentResult_experimentId_promptVersionId_model_key" ON "ExperimentResult"("experimentId", "promptVersionId", "model");

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_promptId_key" ON "Baseline"("promptId");

-- CreateIndex
CREATE INDEX "Baseline_userId_idx" ON "Baseline"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RegressionRun_datasetRunId_key" ON "RegressionRun"("datasetRunId");

-- CreateIndex
CREATE INDEX "RegressionRun_baselineId_idx" ON "RegressionRun"("baselineId");

-- CreateIndex
CREATE INDEX "RegressionRun_userId_idx" ON "RegressionRun"("userId");

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentResult" ADD CONSTRAINT "ExperimentResult_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionRun" ADD CONSTRAINT "RegressionRun_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "Baseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
