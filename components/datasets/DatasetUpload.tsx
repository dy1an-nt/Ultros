"use client"
import { useState } from "react"
import { useCreateDataset } from "@/hooks/useDatasets"

// Server is the validator of record — this component just collects the text
// and surfaces the server's field-specific 400s.
export function DatasetUpload({ onClose }: { onClose: () => void }) {
  const createDataset = useCreateDataset()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [content, setContent] = useState("")
  const [format, setFormat] = useState<"csv" | "json">("csv")
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setContent(await file.text())
    setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv")
  }

  function handleSubmit() {
    setLocalError(null)
    if (!name.trim()) {
      setLocalError("name is required")
      return
    }
    if (!content.trim()) {
      setLocalError("paste data or choose a file")
      return
    }
    let payload: { csvText?: string; rows?: Record<string, unknown>[] }
    if (format === "json") {
      try {
        const rows = JSON.parse(content)
        payload = { rows }
      } catch {
        setLocalError("not valid JSON")
        return
      }
    } else {
      payload = { csvText: content }
    }
    createDataset.mutate(
      { name: name.trim(), description: description.trim() || null, ...payload },
      { onSuccess: onClose }
    )
  }

  const error = localError ?? createDataset.error?.message ?? null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">New Dataset</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        maxLength={100}
        className="bg-gray-800 text-sm text-white rounded px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="bg-gray-800 text-sm text-white rounded px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <label className="flex items-center gap-1">
          <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} /> CSV
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={format === "json"} onChange={() => setFormat("json")} /> JSON array
        </label>
        <input
          type="file"
          accept=".csv,.json"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="text-xs text-gray-500"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={format === "csv" ? "question,expectedOutput\n..." : '[ { "question": "...", "expectedOutput": "..." } ]'}
        rows={8}
        className="bg-gray-800 text-xs text-gray-200 font-mono rounded px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p className="text-xs text-gray-600">
        Max 500 rows, 20 columns, 2 MB. An optional <code>expectedOutput</code> column is stored
        separately for scoring. Datasets are immutable — delete and re-upload to change rows.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={createDataset.isPending}
          className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
        >
          {createDataset.isPending ? "Uploading…" : "Create"}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
