"use client"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { usePromptVersions } from "@/hooks/usePrompts"

export default function VersionsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data, isLoading, error } = usePromptVersions(id)

  const [diffAId, setDiffAId] = useState<string>("")
  const [diffBId, setDiffBId] = useState<string>("")

  if (isLoading) {
    return (
      <div className="p-8 animate-pulse">
        <div className="h-8 bg-gray-800 rounded w-40 mb-6" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="p-8 text-red-400">Failed to load versions: {error.message}</div>
  }

  const versions = data ?? []

  const versionA = versions.find((v) => v.id === diffAId)
  const versionB = versions.find((v) => v.id === diffBId)

  function buildDiff(a: string, b: string) {
    const aLines = a.split("\n")
    const bLines = b.split("\n")
    const maxLen = Math.max(aLines.length, bLines.length)
    return Array.from({ length: maxLen }, (_, i) => ({
      a: aLines[i] ?? null,
      b: bLines[i] ?? null,
      changed: aLines[i] !== bLines[i],
    }))
  }

  const diff = versionA && versionB ? buildDiff(versionA.userPrompt, versionB.userPrompt) : null

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push(`/prompts/${id}`)}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← Back to Editor
        </button>
        <h1 className="text-xl font-bold text-white">Version History</h1>
      </div>

      {!versions.length ? (
        <div className="text-center py-12 text-gray-600">No versions saved yet</div>
      ) : (
        <div className="space-y-3 mb-8">
          {versions.map((v) => (
            <div
              key={v.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <span className="text-white font-medium">v{v.versionNumber}</span>
                {v.label && (
                  <span className="ml-2 text-gray-400 text-sm">{v.label}</span>
                )}
                <span className="ml-3 text-gray-600 text-xs">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={diffAId === v.id ? v.id : ""}
                  onChange={(e) => setDiffAId(e.target.value)}
                  className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-400 focus:outline-none"
                >
                  <option value="">Diff A</option>
                  <option value={v.id}>v{v.versionNumber} as A</option>
                </select>
                <select
                  value={diffBId === v.id ? v.id : ""}
                  onChange={(e) => setDiffBId(e.target.value)}
                  className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-400 focus:outline-none"
                >
                  <option value="">Diff B</option>
                  <option value={v.id}>v{v.versionNumber} as B</option>
                </select>
                <button
                  onClick={() => router.push(`/prompts/${id}?version=${v.id}`)}
                  className="text-xs bg-indigo-900 hover:bg-indigo-800 text-indigo-300 px-3 py-1 rounded transition-colors"
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {diff && versionA && versionB && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">
            Diff: v{versionA.versionNumber} → v{versionB.versionNumber} (user prompt)
          </h2>
          <div className="grid grid-cols-2 gap-4 font-mono text-xs overflow-x-auto">
            <div>
              <div className="text-gray-600 mb-1">v{versionA.versionNumber}</div>
              {diff.map((line, i) => (
                <div
                  key={i}
                  className={`px-2 py-0.5 rounded ${
                    line.changed ? "bg-red-900/30 text-red-300" : "text-gray-500"
                  }`}
                >
                  {line.a ?? ""}
                </div>
              ))}
            </div>
            <div>
              <div className="text-gray-600 mb-1">v{versionB.versionNumber}</div>
              {diff.map((line, i) => (
                <div
                  key={i}
                  className={`px-2 py-0.5 rounded ${
                    line.changed ? "bg-green-900/30 text-green-300" : "text-gray-500"
                  }`}
                >
                  {line.b ?? ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
