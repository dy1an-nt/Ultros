"use client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

type PromptSummary = {
  id: string
  title: string
  description: string | null
  tags: string[]
  createdAt: string
  _count: { versions: number; runs: number }
}

export function RecentPrompts() {
  const { data, isLoading } = useQuery<{ data: PromptSummary[]; error: null }>({
    queryKey: ["prompts"],
    queryFn: () => fetch("/api/prompts").then((r) => r.json()),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  const prompts = data?.data ?? []

  if (!prompts.length) {
    return (
      <div className="text-center py-12 bg-gray-900 rounded-lg border border-gray-800">
        <p className="text-gray-400 mb-4">No prompts yet</p>
        <Link href="/prompts/new" className="text-indigo-400 hover:text-indigo-300 text-sm">
          Create your first prompt →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {prompts.slice(0, 5).map((p) => (
        <Link
          key={p.id}
          href={`/prompts/${p.id}`}
          className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-white">{p.title}</h3>
              {p.description && (
                <p className="text-sm text-gray-400 mt-1 truncate max-w-md">{p.description}</p>
              )}
              <div className="flex gap-2 mt-2">
                {p.tags.map((t) => (
                  <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-xs text-gray-500 text-right shrink-0 ml-4">
              <div>{p._count.versions} versions</div>
              <div>{p._count.runs} runs</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
