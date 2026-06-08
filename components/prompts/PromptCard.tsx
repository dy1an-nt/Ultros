import Link from "next/link"

type PromptSummary = {
  id: string
  title: string
  description: string | null
  tags: string[]
  createdAt: string
  _count: { versions: number; runs: number }
}

export function PromptCard({ prompt: p }: { prompt: PromptSummary }) {
  return (
    <Link
      href={`/prompts/${p.id}`}
      className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="font-medium text-white">{p.title}</h3>
          {p.description && (
            <p className="text-sm text-gray-400 mt-1 truncate">{p.description}</p>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            {p.tags.map((t) => (
              <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-500 text-right shrink-0 ml-4 space-y-1">
          <div>{p._count.versions} versions</div>
          <div>{p._count.runs} runs</div>
          <div>{new Date(p.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
    </Link>
  )
}
