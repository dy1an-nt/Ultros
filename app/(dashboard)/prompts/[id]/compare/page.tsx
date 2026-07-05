"use client"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { CompareView } from "@/components/compare/CompareView"

type PromptVersion = {
  id: string
  versionNumber: number
  label: string | null
}

type PromptData = {
  id: string
  title: string
  versions: PromptVersion[]
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>()

  const { data: prompt, isLoading, error } = useQuery<PromptData>({
    queryKey: ["prompt", id],
    queryFn: async () => {
      const res = await fetch(`/api/prompts/${id}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      return json.data
    },
  })

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>
  }
  if (error || !prompt) {
    return <div className="p-6 text-red-400">Failed to load prompt.</div>
  }

  const latestVersion = prompt.versions?.[0]
  if (!latestVersion) {
    return (
      <div className="p-6 text-gray-500">
        No versions yet.{" "}
        <Link href={`/prompts/${id}`} className="text-indigo-400 hover:underline">
          Go back and save a version first.
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/prompts/${id}`} className="text-gray-500 hover:text-gray-300 text-sm">
          ← {prompt.title}
        </Link>
        <span className="text-gray-700">/</span>
        <h1 className="text-xl font-bold text-white">Compare Models</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Running version {latestVersion.versionNumber}
        {latestVersion.label ? ` — ${latestVersion.label}` : ""}
      </p>
      <CompareView promptVersionId={latestVersion.id} />
    </div>
  )
}
