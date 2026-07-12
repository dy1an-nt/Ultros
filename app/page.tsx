import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Hanken_Grotesk, Source_Serif_4, Spline_Sans_Mono } from "next/font/google"
import { UltrosLogo } from "@/components/landing/Logo"

// Landing implements docs/design/Ultros Landing.dc.html — dark green
// (#0B0F0D / #4FB286), serif display, mono data accents.
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"] })
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500", "600"] })

const GITHUB_URL = "https://github.com/dy1an-nt/Ultros"

const passBadge =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold bg-[#4FB286]/10 border border-[#4FB286]/40 text-[#7FD6AE]"
const warnBadge =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold bg-[#D9A24E]/10 border border-[#D9A24E]/40 text-[#E4BC7A]"
const failBadge =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold bg-[#D26A5D]/10 border border-[#D26A5D]/40 text-[#E0938A]"

const demoRows = [
  { model: "claude-sonnet-4-6", exact: "0.94", score: "8.7 / 10", delta: "+0.06", deltaClass: "text-[#7FD6AE]", badge: passBadge, dot: "#4FB286", status: "Pass" },
  { model: "gpt-5.1", exact: "0.91", score: "8.4 / 10", delta: "+0.03", deltaClass: "text-[#7FD6AE]", badge: passBadge, dot: "#4FB286", status: "Pass" },
  { model: "gemini-3-pro", exact: "0.83", score: "7.1 / 10", delta: "−0.01", deltaClass: "text-[#E4BC7A]", badge: warnBadge, dot: "#D9A24E", status: "Warn" },
  { model: "llama-4-maverick", exact: "0.76", score: "6.2 / 10", delta: "−0.08", deltaClass: "text-[#E0938A]", badge: failBadge, dot: "#D26A5D", status: "Regressed" },
]

const demoMetrics = (row: (typeof demoRows)[number]) => [
  { label: "Exact match", value: row.exact, className: "" },
  { label: "Rubric score", value: row.score, className: "" },
  { label: "Δ vs v12", value: row.delta, className: row.deltaClass },
]

const features = [
  {
    title: "Runs are first-class",
    body: "Every execution is versioned, tracked, and comparable — prompt, model, parameters, and dataset pinned together. Nothing is a one-off.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7FD6AE" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3.5" />
        <line x1="2" y1="12" x2="8.5" y2="12" />
        <line x1="15.5" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    title: "Judges you can trust",
    body: "AI-as-judge with rubrics you define, mixed with deterministic matchers — so a score of 8.7 means the same thing next month.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7FD6AE" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 11.5 11 13.5 15 9.5" />
      </svg>
    ),
  },
  {
    title: "Regressions, caught",
    body: "Diff any two prompt versions across the full dataset. Gate changes on score thresholds, not vibes.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7FD6AE" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="2 6 9.5 13.5 13.5 9.5 22 18" />
        <polyline points="16 18 22 18 22 12" />
      </svg>
    ),
  },
]

export default async function HomePage() {
  const { userId } = await auth()
  if (userId) redirect("/dashboard")

  return (
    <main className={`${sans.className} min-h-screen bg-[#0B0F0D] text-[#ECF1ED] selection:bg-[#4FB286]/35`}>
      {/* Nav */}
      <nav className="max-w-[1120px] mx-auto px-5 sm:px-8 py-7 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <UltrosLogo />
          <span className={`${serif.className} text-[22px] font-semibold tracking-tight`}>Ultros</span>
        </div>
        <div className="flex items-center gap-4 sm:gap-8">
          <a href="#product" className="hidden sm:inline text-[15px] font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors whitespace-nowrap">
            Product
          </a>
          <Link href="/docs" className="hidden sm:inline text-[15px] font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors whitespace-nowrap">
            Docs
          </Link>
          <Link href="/sign-in" className="text-[15px] font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors whitespace-nowrap">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-[15px] font-semibold text-[#07130D] bg-[#4FB286] hover:bg-[#5FC296] rounded-lg px-[18px] py-[9px] whitespace-nowrap shrink-0 transition-colors"
          >
            Start evaluating
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="max-w-[1120px] mx-auto px-5 sm:px-8 pt-24 pb-18 flex flex-col items-center gap-7 text-center">
        <span className={`${mono.className} text-[13px] font-medium tracking-[0.12em] uppercase text-[#7FD6AE]`}>
          Evaluation &amp; prompt experimentation
        </span>
        <h1 className={`${serif.className} text-5xl md:text-[68px] font-medium leading-[1.08] tracking-[-0.018em] max-w-[820px] text-balance`}>
          Ship prompt changes with evidence.
        </h1>
        <p className="text-[19px] leading-[1.65] text-[#9FAFA4] max-w-[620px] text-pretty">
          Ultros is an evaluation platform for teams building on LLMs. It runs every prompt
          version across your datasets and models, scores each output, and shows exactly what
          regressed — before your users do.
        </p>
        <div className="flex items-center gap-3.5 mt-2">
          <Link
            href="/sign-up"
            className="text-base font-semibold text-[#07130D] bg-[#4FB286] hover:bg-[#5FC296] rounded-lg px-[26px] py-[13px] transition-colors"
          >
            Start evaluating
          </Link>
          <a
            href="#product"
            className="text-base font-semibold text-[#ECF1ED] border border-[#2E3C33] hover:border-[#4FB286] hover:text-[#7FD6AE] rounded-lg px-[26px] py-3 transition-colors"
          >
            See it in action
          </a>
        </div>
      </header>

      {/* Product proof: eval run */}
      <section id="product" className="max-w-[1120px] mx-auto px-5 sm:px-8 pb-28">
        <div className="bg-[#121815] border border-[#243029] rounded-[14px] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-[18px] border-b border-[#1B231F]">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
              <span className={`${mono.className} text-sm font-semibold`}>run #214</span>
              <span className="text-sm text-[#76867B]">support-triage @ v13 · dataset: tickets-1k · 4 models</span>
            </div>
            <span className={passBadge}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4FB286]" />
              Completed
            </span>
          </div>
          <div className="hidden md:grid grid-cols-[1.3fr_0.9fr_1fr_0.9fr_1fr] gap-4 px-7 py-[13px] border-b border-[#1B231F] text-xs font-semibold tracking-[0.08em] uppercase text-[#76867B]">
            <span>Model</span>
            <span>Exact match</span>
            <span>Rubric score</span>
            <span>Δ vs v12</span>
            <span>Status</span>
          </div>
          {demoRows.map((row, i) => (
            <div key={row.model} className={`px-5 sm:px-7 py-[15px] text-[15px] ${i > 0 ? "border-t border-[#1B231F]" : ""}`}>
              <div className="hidden md:grid grid-cols-[1.3fr_0.9fr_1fr_0.9fr_1fr] gap-4 items-center">
                <span className={mono.className}>{row.model}</span>
                <span className={mono.className}>{row.exact}</span>
                <span className={mono.className}>{row.score}</span>
                <span className={`${mono.className} ${row.deltaClass}`}>{row.delta}</span>
                <span className="justify-self-start">
                  <span className={row.badge}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.dot }} />
                    {row.status}
                  </span>
                </span>
              </div>
              <div className="md:hidden flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className={mono.className}>{row.model}</span>
                  <span className={row.badge}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: row.dot }} />
                    {row.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {demoMetrics(row).map((m) => (
                    <div key={m.label} className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#76867B]">{m.label}</span>
                      <span className={`${mono.className} ${m.className}`}>{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[#1B231F]">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-24 flex flex-col gap-14">
          <h2 className={`${serif.className} text-[40px] font-medium tracking-[-0.015em] leading-[1.15] max-w-[560px] text-balance`}>
            Every run is an experiment. Every experiment is scored.
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            {features.map((f) => (
              <div key={f.title} className="flex flex-col gap-3.5">
                {f.icon}
                <h3 className="text-xl font-semibold tracking-tight">{f.title}</h3>
                <p className="text-base leading-[1.65] text-[#9FAFA4] text-pretty">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="border-t border-[#1B231F]">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-24 grid md:grid-cols-[1fr_1.4fr] gap-12 md:gap-16 items-center">
          <div className="flex flex-col gap-[18px]">
            <h2 className={`${serif.className} text-[40px] font-medium tracking-[-0.015em] leading-[1.15] text-balance`}>
              Minutes to your first eval.
            </h2>
            <p className="text-[17px] leading-[1.65] text-[#9FAFA4] text-pretty">
              Point Ultros at a prompt and a dataset. It fans out across models, scores every
              output, and reports the delta against your last version — win matrix,
              per-criterion breakdown, and per-row drill-down included.
            </p>
            <Link
              href="/sign-up"
              className="self-start text-base font-semibold text-[#7FD6AE] border-b border-[#7FD6AE]/35 pb-0.5"
            >
              Create your first experiment →
            </Link>
          </div>
          <div className="bg-[#121815] border border-[#243029] rounded-xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
            <Image
              src="/landing/experiment-results.png"
              alt="Ultros experiment results: completion status per cell, average score, variance, pass rate, latency, and cost for two prompt variants across two models, with a win matrix comparing variants"
              width={1600}
              height={772}
              className="w-full h-auto"
            />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-[#1B231F]">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-28 flex flex-col items-center gap-[26px] text-center">
          <h2 className={`${serif.className} text-5xl font-medium tracking-[-0.015em] leading-[1.1] max-w-[640px] text-balance`}>
            Stop eyeballing outputs.
          </h2>
          <p className="text-lg leading-[1.6] text-[#9FAFA4] max-w-[480px] text-pretty">
            Your next prompt change ships with a number attached.
          </p>
          <Link
            href="/sign-up"
            className="text-base font-semibold text-[#07130D] bg-[#4FB286] hover:bg-[#5FC296] rounded-lg px-7 py-3.5 mt-1.5 transition-colors"
          >
            Start evaluating
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1B231F]">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-9 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <UltrosLogo size={20} />
              <span className={`${serif.className} text-lg font-semibold`}>Ultros</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#product" className="text-sm font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors">
                Product
              </a>
              <Link href="/docs" className="text-sm font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors">
                Docs
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm text-[#76867B]">
            <span>An AI evaluation platform — every run scored, every regression caught.</span>
            <span>
              Built by{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors"
              >
                Dylan Teopaco
              </a>{" "}
              · source on GitHub
            </span>
          </div>
        </div>
      </footer>
    </main>
  )
}
