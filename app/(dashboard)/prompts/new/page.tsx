"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api/client"

export default function NewPromptPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [userPrompt, setUserPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !userPrompt.trim()) {
      setError("Title and User Prompt are required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const prompt = await apiFetch<{ id: string }>("/api/prompts", {
        method: "POST",
        json: {
          title: title.trim(),
          description: description.trim() || undefined,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          systemPrompt,
          userPrompt,
        },
      })
      router.push(`/prompts/${prompt.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">New Prompt</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Customer Support Responder"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does this prompt do?"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Tags (comma-separated)
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="classification, summarization, extraction"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">System Prompt</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={3}
            placeholder="You are a helpful assistant..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">User Prompt *</label>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            required
            rows={6}
            placeholder="Write your prompt here. Use {{variable}} for dynamic values."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {loading ? "Creating..." : "Create Prompt"}
        </button>
      </form>
    </div>
  )
}
