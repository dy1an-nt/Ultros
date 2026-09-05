"use client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/queryKeys"

type ShareItem = {
  id: string
  token: string
  url: string
  resourceType: string
  resourceId: string
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  promptRun: "Run",
  datasetRun: "Dataset run",
  experiment: "Experiment",
}

export function ShareList() {
  const queryClient = useQueryClient()
  const shares = useQuery<ShareItem[]>({
    queryKey: queryKeys.shares(),
    queryFn: () => apiFetch<ShareItem[]>("/api/share"),
  })
  const revoke = useMutation<{ token: string }, Error, string>({
    mutationFn: (token) => apiFetch<{ token: string }>(`/api/share/${token}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.shares() }),
  })

  if (shares.isLoading) return <div className="h-20 bg-gray-800 rounded-lg animate-pulse" />
  if (shares.error) {
    return <p className="text-sm text-red-400">Failed to load share links: {shares.error.message}</p>
  }
  if (!shares.data || shares.data.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No active share links. Use the Share button on a run, dataset run, or experiment.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {revoke.error && <p className="text-sm text-red-400">Revoke failed: {revoke.error.message}</p>}
      {shares.data.map((share) => (
        <div
          key={share.id}
          className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm"
        >
          <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400 shrink-0">
            {TYPE_LABELS[share.resourceType] ?? share.resourceType}
          </span>
          <a
            href={share.url}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:text-indigo-300 truncate"
          >
            {share.url}
          </a>
          <span className="text-xs text-gray-600 ml-auto shrink-0">
            {new Date(share.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={() => revoke.mutate(share.token)}
            disabled={revoke.isPending}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors shrink-0"
          >
            Revoke
          </button>
        </div>
      ))}
    </div>
  )
}
