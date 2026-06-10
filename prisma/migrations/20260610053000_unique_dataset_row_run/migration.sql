-- CreateIndex
CREATE UNIQUE INDEX "PromptRun_datasetRunId_datasetRowId_key" ON "PromptRun"("datasetRunId", "datasetRowId");
