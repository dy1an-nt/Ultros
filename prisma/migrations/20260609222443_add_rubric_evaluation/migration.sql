-- CreateTable
CREATE TABLE "Rubric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL,
    "passThreshold" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "promptRunId" TEXT NOT NULL,
    "rubricId" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "criteriaScores" JSONB,
    "criteriaSnapshot" JSONB NOT NULL,
    "aiEvalReasoning" TEXT,
    "evalMethod" TEXT NOT NULL,
    "judgeModel" TEXT,
    "judgeInputTokens" INTEGER,
    "judgeOutputTokens" INTEGER,
    "judgeCostUsd" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rubric_userId_idx" ON "Rubric"("userId");

-- CreateIndex
CREATE INDEX "Evaluation_promptRunId_idx" ON "Evaluation"("promptRunId");

-- CreateIndex
CREATE INDEX "Evaluation_userId_idx" ON "Evaluation"("userId");

-- CreateIndex
CREATE INDEX "Evaluation_rubricId_idx" ON "Evaluation"("rubricId");

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_promptRunId_fkey" FOREIGN KEY ("promptRunId") REFERENCES "PromptRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;
