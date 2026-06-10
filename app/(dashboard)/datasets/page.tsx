"use client"
import { useState } from "react"
import Link from "next/link"
import { useDatasets, useDeleteDataset } from "@/hooks/useDatasets"
import { DatasetUpload } from "@/components/datasets/DatasetUpload"
import type { DatasetDto } from "@/types/dataset"

export default function DatasetsPage() {
  const { data: datasets, isLoading, error } = useDatasets()
  const deleteDataset = useDeleteDataset()
  const [uploading, setUploading] = useState(false)

  function handleDelete(dataset: DatasetDto) {
    if (!window.confirm(`Delete dataset “${dataset.name}”? This is blocked if it has runs.`)) return
    deleteDataset.mutate(dataset.id)
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Datasets</h1>
        {!uploading && (
          <button
            onClick={() => setUploading(true)}
            className="px-4 py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            New Dataset
          </button>
        )}
      </div>

      {uploading && <DatasetUpload onClose={() => setUploading(false)} />}

      {deleteDataset.error && (
        <p className="text-sm text-red-400">Delete failed: {deleteDataset.error.message}</p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-400 py-4">Failed to load datasets: {error.message}</div>
      ) : !datasets || datasets.length === 0 ? (
        !uploading && (
          <div className="text-center py-16 text-gray-600 text-sm">
            No datasets yet — upload a CSV or JSON file to batch-test your prompts.
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-2"
            >
              <Link
                href={`/datasets/${dataset.id}`}
                className="text-white font-medium hover:text-indigo-400 transition-colors"
              >
                {dataset.name}
              </Link>
              {dataset.description && (
                <p className="text-sm text-gray-500 line-clamp-2">{dataset.description}</p>
              )}
              <p className="text-xs text-gray-600">
                {dataset.rowCount} rows · {dataset.columns.length} columns
              </p>
              <button
                onClick={() => handleDelete(dataset)}
                disabled={deleteDataset.isPending && deleteDataset.variables === dataset.id}
                className="self-start text-xs text-gray-600 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
