"use client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { PromptCard } from "@/components/prompts/PromptCard"

type PromptSummary = {
  id: string
  title: string
  description: string | null
  tags: string[]
  createdAt: string
  _count: { versions: number; runs: number }
}

export default function PromptsPage() {
  const { data, isLoading } = useQuery<{ data: PromptSummary[]; error: null }>({
    queryKey: ["prompts"],
    queryFn: () => fetch("/api/prompts").then((r) => r.json()),
  })

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Prompts</h1>
        <Link
          href="/prompts/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + New Prompt
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !data?.data?.length ? (
        <div className="text-center py-16 bg-gray-900 rounded-lg border border-gray-800">
          <p className="text-gray-400 mb-4">No prompts yet</p>
          <Link href="/prompts/new" className="text-indigo-400 hover:text-indigo-300 text-sm">
            Create your first prompt →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((p) => (
            <PromptCard key={p.id} prompt={p} />
          ))}
        </div>
      )}
    </div>
  )
}
