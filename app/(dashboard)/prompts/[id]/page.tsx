"use client"
import { useState, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { SystemPromptPanel } from "@/components/editor/SystemPromptPanel"
import { RunControls } from "@/components/editor/RunControls"
import { StreamingOutput } from "@/components/editor/StreamingOutput"
import { RunHistory } from "@/components/runs/RunHistory"
import Link from "next/link"

const PromptEditor = dynamic(
  () => import("@/components/editor/PromptEditor").then((m) => ({ default: m.PromptEditor })),
  { ssr: false, loading: () => <div className="h-full min-h-[300px] bg-gray-900 animate-pulse" /> }
)

type PromptVersion = {
  id: string
  versionNumber: number
  label: string | null
  systemPrompt: string
  userPrompt: string
  variables: Record<string, string>
  createdAt: string
}

type PromptDetail = {
  id: string
  title: string
  description: string | null
  tags: string[]
  versions: PromptVersion[]
  _count: { runs: number }
}

export default function PromptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const restoreVersionId = searchParams.get("version")
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<{ data: PromptDetail; error: null }>({
    queryKey: ["prompt", id],
    queryFn: () => fetch(`/api/prompts/${id}`).then((r) => r.json()),
  })

  const [systemPrompt, setSystemPrompt] = useState("")
  const [userPrompt, setUserPrompt] = useState("")
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"output" | "history">("output")
  const [runOutput, setRunOutput] = useState<{ text: string; done: boolean } | null>(null)

  const versions = data?.data?.versions ?? []
  const latestVersion = versions[0]

  useEffect(() => {
    if (!versions.length) return
    const target = restoreVersionId
      ? (versions.find((v) => v.id === restoreVersionId) ?? latestVersion)
      : latestVersion
    if (target && target.id !== activeVersionId) {
      setSystemPrompt(target.systemPrompt)
      setUserPrompt(target.userPrompt)
      setActiveVersionId(target.id)
    }
  }, [versions, restoreVersionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRun(model: string, temperature: number, maxTokens: number) {
    if (!activeVersionId) return
    setRunOutput({ text: "", done: false })
    setActiveTab("output")

    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptVersionId: activeVersionId, model, temperature, maxTokens }),
    })

    if (!res.ok || !res.body) {
      setRunOutput({ text: "Run failed. Check your API key and try again.", done: true })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      fullText += chunk
      setRunOutput({ text: fullText, done: false })
    }

    setRunOutput({ text: fullText, done: true })
    queryClient.invalidateQueries({ queryKey: ["runs", id] })
  }

  async function handleSaveVersion() {
    const res = await fetch(`/api/prompts/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt, userPrompt }),
    })
    const json = await res.json()
    if (!json.error) {
      setActiveVersionId(json.data.id)
      queryClient.invalidateQueries({ queryKey: ["prompt", id] })
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 bg-gray-800 rounded w-48 mb-6 animate-pulse" />
        <div className="h-64 bg-gray-800 rounded animate-pulse" />
      </div>
    )
  }

  if (!data?.data) {
    return <div className="p-8 text-red-400">Prompt not found</div>
  }

  const prompt = data.data

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/prompts" className="text-gray-500 hover:text-gray-300 text-sm shrink-0">
            ← Prompts
          </Link>
          <h1 className="text-base font-semibold text-white truncate">{prompt.title}</h1>
          <div className="flex gap-1 flex-wrap">
            {prompt.tags.map((t) => (
              <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <Link
            href={`/prompts/${id}/compare`}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Compare
          </Link>
          <Link
            href={`/prompts/${id}/versions`}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            {prompt.versions.length} {prompt.versions.length === 1 ? "version" : "versions"}
          </Link>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: editor */}
        <div className="w-1/2 flex flex-col border-r border-gray-800 overflow-hidden">
          <SystemPromptPanel value={systemPrompt} onChange={setSystemPrompt} />
          <div className="flex-1 overflow-auto">
            <PromptEditor value={userPrompt} onChange={setUserPrompt} />
          </div>
          <div className="border-t border-gray-800 shrink-0">
            <RunControls onRun={handleRun} onSaveVersion={handleSaveVersion} />
          </div>
        </div>

        {/* Right: output + history */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex border-b border-gray-800 shrink-0">
            {(["output", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "text-white border-b-2 border-indigo-500"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab === "history" ? "Run History" : "Output"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {activeTab === "output" ? (
              <StreamingOutput output={runOutput} />
            ) : (
              <RunHistory promptId={id} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
