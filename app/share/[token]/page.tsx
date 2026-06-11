import Link from "next/link"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { resolveShareByToken } from "@/lib/share/resolve"
import { checkRateLimit } from "@/lib/rateLimit"
import {
  PublicBatchView,
  PublicExperimentView,
  PublicRunView,
} from "@/components/share/PublicViews"

// Capability URL: never indexed, never leaked via referrer.
export const metadata: Metadata = {
  title: "Shared result — Ultros",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const limited = await checkRateLimit("sharePublic", ip)

  const share = limited.ok ? await resolveShareByToken(token) : null

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <header className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-white font-bold">
            Ultros
          </Link>
          <Link
            href="/sign-up"
            className="px-3 py-1.5 text-sm rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors"
          >
            Evaluate your own prompts
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {!limited.ok ? (
          <div className="text-center py-24 text-gray-500">
            Too many requests — try again in a moment.
          </div>
        ) : !share ? (
          <div className="text-center py-24 text-gray-500">
            This share link does not exist or has been revoked.
          </div>
        ) : (
          <>
            {share.resourceType === "promptRun" && <PublicRunView run={share.resource} />}
            {share.resourceType === "datasetRun" && <PublicBatchView run={share.resource} />}
            {share.resourceType === "experiment" && (
              <PublicExperimentView experiment={share.resource} />
            )}
            <p className="mt-8 text-xs text-gray-600">
              Shared read-only via Ultros on {new Date(share.sharedAt).toLocaleDateString()}.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
