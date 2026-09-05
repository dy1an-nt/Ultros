"use client"
import { useState } from "react"
import { apiFetch } from "@/lib/api/client"

type ShareResult = { token: string; url: string; createdAt: string }

// Create (or fetch the existing) share link for a resource and copy it.
export function ShareButton({
  resourceType,
  resourceId,
}: {
  resourceType: "promptRun" | "datasetRun" | "experiment"
  resourceId: string
}) {
  const [state, setState] = useState<"idle" | "working" | "copied" | "error">("idle")
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function share() {
    setState("working")
    setError(null)
    try {
      const data = await apiFetch<ShareResult>("/api/share", {
        method: "POST",
        json: { resourceType, resourceId },
      })
      setUrl(data.url)
      try {
        await navigator.clipboard.writeText(data.url)
        setState("copied")
      } catch {
        setState("idle") // clipboard blocked. The URL is still shown inline
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed")
      setState("error")
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={share}
        disabled={state === "working"}
        className="px-3 py-1 text-sm rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 transition-colors"
      >
        {state === "working" ? "Sharing…" : state === "copied" ? "Link copied!" : "Share"}
      </button>
      {url && state !== "copied" && (
        <span className="text-xs text-gray-500 select-all break-all">{url}</span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  )
}
