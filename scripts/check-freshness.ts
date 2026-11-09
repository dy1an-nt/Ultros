// Compares MODEL_CATALOG with what the providers serve today and prints a
// markdown report. Read-only: it never edits the catalog, because a new entry
// needs capability flags that only a person checking the provider can set.
//
// Anthropic is checked against GET /v1/models when ANTHROPIC_API_KEY is set.
// OpenRouter's public model list needs no key, and doubles as a retirement
// hint for the OpenAI and Google direct entries.
import { appendFileSync } from "node:fs"
import { MODEL_CATALOG, type ModelInfo } from "../lib/ai/models"

type AnthropicModel = { id: string; display_name: string; created_at: string; max_input_tokens?: number }
type OpenRouterModel = {
  id: string
  name: string
  created: number
  context_length: number
  pricing: { prompt: string; completion: string }
}

const NEW_MODEL_WINDOW_DAYS = 120
const PRICE_TOLERANCE = 0.005

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return (await res.json()) as T
}

// The API lists some models under a dated snapshot id (claude-haiku-4-5-20251001).
function isSameModel(catalogId: string, liveId: string): boolean {
  return liveId === catalogId || liveId.startsWith(`${catalogId}-`)
}

function perMillion(perToken: string): number {
  return Number(perToken) * 1_000_000
}

async function checkAnthropic(entries: ModelInfo[]): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return []
  const { data } = await getJson<{ data: AnthropicModel[] }>("https://api.anthropic.com/v1/models?limit=1000", {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  })
  const findings: string[] = []
  const known = (m: AnthropicModel) => entries.some((e) => isSameModel(e.id, m.id))

  for (const entry of entries) {
    const live = data.find((m) => isSameModel(entry.id, m.id))
    if (!live) {
      findings.push(`\`${entry.id}\` is in the catalog but Anthropic no longer serves it.`)
    } else if (live.max_input_tokens && live.max_input_tokens !== entry.contextWindow) {
      findings.push(`\`${entry.id}\` context window is ${entry.contextWindow} in the catalog, ${live.max_input_tokens} live.`)
    }
  }

  const newestKnown = Math.max(...data.filter(known).map((m) => Date.parse(m.created_at)))
  for (const m of data) {
    if (!known(m) && Date.parse(m.created_at) > newestKnown) {
      findings.push(`New Anthropic model \`${m.id}\` (${m.display_name}, ${m.created_at.slice(0, 10)}) is not in the catalog.`)
    }
  }
  return findings
}

function checkOpenRouter(entries: ModelInfo[], live: OpenRouterModel[]): string[] {
  const findings: string[] = []
  for (const entry of entries) {
    const m = live.find((x) => x.id === entry.id)
    if (!m) {
      findings.push(`\`${entry.id}\` is in the catalog but OpenRouter no longer lists it.`)
      continue
    }
    const input = perMillion(m.pricing.prompt)
    const output = perMillion(m.pricing.completion)
    if (
      Math.abs(input - entry.inputPerMillion) > PRICE_TOLERANCE ||
      Math.abs(output - entry.outputPerMillion) > PRICE_TOLERANCE
    ) {
      findings.push(
        `\`${entry.id}\` is priced $${entry.inputPerMillion} / $${entry.outputPerMillion} in the catalog, $${input.toFixed(3)} / $${output.toFixed(3)} live.`
      )
    }
    if (m.context_length !== entry.contextWindow) {
      findings.push(`\`${entry.id}\` context window is ${entry.contextWindow} in the catalog, ${m.context_length} live.`)
    }
  }
  return findings
}

// OpenRouter mirrors the OpenAI and Google lineups under a vendor prefix, so a
// direct id that has vanished there has very likely been retired upstream.
function checkDirectViaOpenRouter(entries: ModelInfo[], live: OpenRouterModel[]) {
  const findings: string[] = []
  const notes: string[] = []
  const cutoff = Date.now() / 1000 - NEW_MODEL_WINDOW_DAYS * 86_400

  for (const provider of ["openai", "google"] as const) {
    const prefix = `${provider}/`
    const listed = live.filter((m) => m.id.startsWith(prefix) && !m.id.includes(":"))
    const mine = entries.filter((e) => e.provider === provider)
    const inCatalog = (m: OpenRouterModel) => mine.some((e) => m.id.startsWith(`${prefix}${e.id}`))

    for (const entry of mine) {
      if (!listed.some((m) => m.id.startsWith(`${prefix}${entry.id}`))) {
        findings.push(
          `\`${entry.id}\` (${provider} direct) is no longer listed on OpenRouter, which usually means it was retired.`
        )
      }
    }
    const recent = listed
      .filter((m) => m.created > cutoff && !inCatalog(m))
      .sort((a, b) => b.created - a.created)
      .slice(0, 5)
    for (const m of recent) {
      notes.push(`\`${m.id}\` (${m.name}, ${new Date(m.created * 1000).toISOString().slice(0, 10)})`)
    }
  }
  return { findings, notes }
}

async function main() {
  const byProvider = (p: ModelInfo["provider"]) => MODEL_CATALOG.filter((m) => m.provider === p)
  const { data: openRouter } = await getJson<{ data: OpenRouterModel[] }>("https://openrouter.ai/api/v1/models")

  const anthropic = await checkAnthropic(byProvider("anthropic"))
  const longTail = checkOpenRouter(byProvider("openrouter"), openRouter)
  const direct = checkDirectViaOpenRouter(MODEL_CATALOG, openRouter)
  const findings = [...anthropic, ...longTail, ...direct.findings]

  const lines: string[] = []
  lines.push(findings.length ? `## Catalog drift: ${findings.length} finding(s)` : "## Catalog matches the providers")
  lines.push("", `Checked \`lib/ai/models.ts\` on ${new Date().toISOString().slice(0, 10)}.`)
  if (!process.env.ANTHROPIC_API_KEY) lines.push("", "Anthropic was skipped: `ANTHROPIC_API_KEY` is not set.")
  if (findings.length) lines.push("", ...findings.map((f) => `- [ ] ${f}`))
  if (direct.notes.length) {
    lines.push("", `### Released in the last ${NEW_MODEL_WINDOW_DAYS} days and not in the catalog`, "")
    lines.push("Informational. Verify ids, prices, and capability flags against the provider before adding any.", "")
    lines.push(...direct.notes.map((n) => `- ${n}`))
  }
  process.stdout.write(lines.join("\n") + "\n")

  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `drift=${findings.length > 0}\n`)
}

main().catch((err) => {
  process.stderr.write(`freshness check failed: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
