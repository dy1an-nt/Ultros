import Papa from "papaparse"
import { prisma } from "@/lib/prisma"
import { withUser } from "@/lib/api/handler"

// Cells starting with = + - @ execute as formulas when the CSV is opened in a
// spreadsheet, prefix them with ' so they render as text.
function guardCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

export const GET = withUser<{ id: string }>(async ({ params, db }) => {
  const run = await db.datasetRun.requireWithColumns(params.id)

  const promptRuns = await prisma.promptRun.findMany({
    where: { datasetRunId: run.id },
    orderBy: { datasetRow: { rowIndex: "asc" } },
    select: {
      responseText: true,
      latencyMs: true,
      costUsd: true,
      finishReason: true,
      datasetRow: { select: { rowIndex: true, data: true, expectedOutput: true } },
      evaluations: {
        select: { totalScore: true, passed: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  })

  const columns = run.dataset.columns
  const header = [
    "rowIndex",
    ...columns,
    "expectedOutput",
    "responseText",
    "score",
    "passed",
    "latencyMs",
    "costUsd",
    "finishReason",
  ]
  const records = promptRuns.map((r) => {
    const data = (r.datasetRow?.data ?? {}) as Record<string, string>
    const evaluation = r.evaluations[0]
    return [
      String(r.datasetRow?.rowIndex ?? ""),
      ...columns.map((c) => guardCell(data[c] ?? "")),
      guardCell(r.datasetRow?.expectedOutput ?? ""),
      guardCell(r.responseText),
      evaluation?.totalScore !== null && evaluation?.totalScore !== undefined
        ? String(evaluation.totalScore)
        : "",
      evaluation?.passed === null || evaluation?.passed === undefined ? "" : String(evaluation.passed),
      String(r.latencyMs),
      String(r.costUsd),
      r.finishReason ?? "",
    ]
  })

  const csv = Papa.unparse({ fields: header, data: records })
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dataset-run-${run.id}.csv"`,
    },
  })
})
