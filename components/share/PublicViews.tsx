import type {
  PublicDatasetRun,
  PublicExperiment,
  PublicPromptRun,
} from "@/lib/share/resolve"

// Server-rendered, read-only views for public share pages. All user content
// goes through React text nodes, no dangerouslySetInnerHTML, no markdown.

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  )
}

function pct(v: number | null): string {
  return v !== null ? `${Math.round(v * 100)}%` : "N/A"
}
function num(v: number | null, digits = 3): string {
  return v !== null ? v.toFixed(digits) : "N/A"
}

export function PublicRunView({ run }: { run: PublicPromptRun }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-white">{run.promptTitle}</h1>
        <p className="text-sm text-gray-500">
          v{run.versionNumber} · {run.model} · {new Date(run.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Latency" value={`${run.latencyMs} ms`} />
        <Stat label="Tokens" value={`${run.inputTokens} in / ${run.outputTokens} out`} />
        <Stat label="Cost" value={`$${run.costUsd.toFixed(4)}`} />
        <Stat
          label="Score"
          value={run.eval?.totalScore !== null && run.eval !== null ? num(run.eval.totalScore, 2) : "N/A"}
        />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-xs text-gray-500 mb-2">Response</p>
        <p className="text-sm text-gray-200 whitespace-pre-wrap">{run.responseText}</p>
      </div>
      {run.eval && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-2">
          <p className="text-xs text-gray-500">
            Evaluation. {run.eval.passed ? "passed" : "failed"}
          </p>
          <div className="flex flex-wrap gap-2">
            {run.eval.criteria.map((c) => (
              <span
                key={c.name}
                className={`px-2 py-0.5 rounded text-xs ${c.score >= 0.5 ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}
              >
                {c.name}: {c.score.toFixed(2)}
              </span>
            ))}
          </div>
          {run.eval.aiEvalReasoning && (
            <p className="text-xs text-gray-400 whitespace-pre-wrap">{run.eval.aiEvalReasoning}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function PublicBatchView({ run }: { run: PublicDatasetRun }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-white">
          {run.promptTitle} <span className="text-gray-500 font-normal">on</span> {run.datasetName}
        </h1>
        <p className="text-sm text-gray-500">
          v{run.versionNumber} · {run.model} · {run.totalRows} rows ·{" "}
          {new Date(run.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Avg score" value={num(run.avgScore)} />
        <Stat label="Pass rate" value={pct(run.passRate)} />
        <Stat label="Variance" value={num(run.scoreVariance, 4)} />
        <Stat label="Avg latency" value={run.avgLatencyMs !== null ? `${run.avgLatencyMs} ms` : "N/A"} />
        <Stat label="Total cost" value={`$${run.totalCostUsd.toFixed(4)}`} />
      </div>
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Input</th>
              <th className="px-3 py-2 font-medium">Response</th>
              <th className="px-3 py-2 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {run.rows.map((row) => (
              <tr key={row.rowIndex} className="border-t border-gray-800 text-gray-300 align-top">
                <td className="px-3 py-2 text-gray-500">{row.rowIndex}</td>
                <td className="px-3 py-2 max-w-xs">
                  {Object.entries(row.input).map(([k, v]) => (
                    <p key={k} className="truncate text-xs">
                      <span className="text-emerald-500">{k}:</span> {v}
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2 max-w-md">
                  <p className="line-clamp-3 whitespace-pre-wrap text-xs">{row.responseText}</p>
                </td>
                <td className="px-3 py-2">
                  {row.score === null ? (
                    <span className="text-gray-600">, </span>
                  ) : (
                    <span className={row.passed ? "text-green-400" : "text-red-400"}>
                      {row.score.toFixed(2)} {row.passed ? "✓" : "✗"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function PublicExperimentView({ experiment }: { experiment: PublicExperiment }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-white">{experiment.name}</h1>
        <p className="text-sm text-gray-500">
          {experiment.promptTitle} · {experiment.models.join(", ")} ·{" "}
          {new Date(experiment.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="rounded-lg border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Avg score</th>
              <th className="px-3 py-2 font-medium">Pass rate</th>
              <th className="px-3 py-2 font-medium">Latency</th>
              <th className="px-3 py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {experiment.results.map((r) => (
              <tr key={`${r.versionNumber}-${r.model}`} className="border-t border-gray-800 text-gray-300">
                <td className="px-3 py-2">
                  v{r.versionNumber}
                  {r.label ? `, ${r.label}` : ""}
                </td>
                <td className="px-3 py-2 text-gray-500">{r.model}</td>
                <td className="px-3 py-2">
                  {r.cellStatus === "failed" ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-red-900 text-red-300">failed</span>
                  ) : (
                    num(r.avgScore)
                  )}
                </td>
                <td className="px-3 py-2">{pct(r.passRate)}</td>
                <td className="px-3 py-2 text-gray-500">
                  {r.avgLatencyMs !== null ? `${r.avgLatencyMs} ms` : "N/A"}
                </td>
                <td className="px-3 py-2 text-gray-500">${r.totalCostUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {experiment.winMatrix.length > 0 && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Pair</th>
                <th className="px-3 py-2 font-medium">Δ mean</th>
              </tr>
            </thead>
            <tbody>
              {experiment.winMatrix.map((e) => (
                <tr key={`${e.a}-${e.b}-${e.model}`} className="border-t border-gray-800 text-gray-300">
                  <td className="px-3 py-2 text-gray-500">{e.model}</td>
                  <td className="px-3 py-2">
                    v{e.a} vs v{e.b}
                    {e.insufficientSample && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs bg-yellow-900 text-yellow-300">
                        insufficient sample
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 font-medium ${e.meanDiff > 0 ? "text-green-400" : e.meanDiff < 0 ? "text-red-400" : "text-gray-400"}`}>
                    {e.meanDiff >= 0 ? "+" : ""}
                    {e.meanDiff.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
