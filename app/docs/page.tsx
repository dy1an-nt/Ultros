"use client"

import { useState } from "react"
import Link from "next/link"
import { Hanken_Grotesk, Source_Serif_4, Spline_Sans_Mono } from "next/font/google"
import { UltrosLogo } from "@/components/landing/Logo"

const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"] })
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500", "600"] })

type Section =
  | "installation"
  | "quickstart"
  | "core-concepts"
  | "datasets"
  | "judges-rubrics"
  | "calibration"
  | "regression-gates"
  | "python-sdk"
  | "cli"
  | "rest-api"

const sidebarGroups = [
  {
    label: "Getting started",
    items: [
      { id: "installation" as Section, label: "Installation" },
      { id: "quickstart" as Section, label: "Quickstart" },
      { id: "core-concepts" as Section, label: "Core concepts" },
    ],
  },
  {
    label: "Evaluation",
    items: [
      { id: "datasets" as Section, label: "Datasets" },
      { id: "judges-rubrics" as Section, label: "Judges & rubrics" },
      { id: "calibration" as Section, label: "Calibration" },
      { id: "regression-gates" as Section, label: "Regression gates" },
    ],
  },
  {
    label: "Reference",
    items: [
      { id: "python-sdk" as Section, label: "Python SDK" },
      { id: "cli" as Section, label: "CLI" },
      { id: "rest-api" as Section, label: "REST API" },
    ],
  },
]

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${mono.className} bg-[#121815] border border-[#243029] rounded-[10px] px-[22px] py-[18px] text-[14.5px] leading-[1.8] text-[#ECF1ED] overflow-x-auto`}
    >
      {children}
    </div>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#4FB286]/[0.07] border border-[#4FB286]/25 rounded-[10px] p-4 flex gap-3 items-start">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#7FD6AE"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 mt-0.5"
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <circle cx="12" cy="15.5" r="0.5" />
      </svg>
      <p className="text-[14.5px] leading-[1.6] text-[#9FAFA4]">{children}</p>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className={`${mono.className} text-[14px] text-[#7FD6AE]`}>{n}</span>
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function NavCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-[#121815] border border-[#1B231F] hover:border-[#4FB286] rounded-[10px] p-5 text-left flex flex-col gap-1.5 transition-colors w-full"
    >
      <span className="text-base font-semibold text-[#ECF1ED]">{title} →</span>
      <span className="text-sm text-[#7E8C82]">{desc}</span>
    </button>
  )
}

function Installation({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Getting started
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Installation
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          Ultros runs as a web app, no install required for the UI. The Python SDK is optional and
          adds programmatic access for CI pipelines and notebook workflows.
        </p>
      </div>

      <Step n={1} title="Create an account">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Sign up at{" "}
          <Link href="/sign-up" className="text-[#7FD6AE] underline underline-offset-2">
            ultros.app
          </Link>{" "}
          with GitHub, Google, or email. Your account is the container for prompts, datasets,
          experiments, and usage history.
        </p>
      </Step>

      <Step n={2} title="Add your model keys">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Ultros calls model providers with your own API keys. You pay them directly at their list
          price. Keys are encrypted at rest and never logged.
        </p>
        <p className="text-sm text-[#7E8C82]">
          Go to{" "}
          <Link href="/settings" className="text-[#7FD6AE]">
            Settings → API Keys
          </Link>{" "}
          and add keys for the providers you want to test against.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Anthropic", key: "ANTHROPIC_API_KEY" },
            { label: "OpenAI", key: "OPENAI_API_KEY" },
            { label: "Google", key: "GOOGLE_API_KEY" },
          ].map((p) => (
            <div
              key={p.label}
              className="bg-[#121815] border border-[#243029] rounded-lg p-3.5 flex flex-col gap-1"
            >
              <span className="text-sm font-semibold text-[#ECF1ED]">{p.label}</span>
              <span className={`${mono.className} text-xs text-[#7E8C82]`}>{p.key}</span>
            </div>
          ))}
        </div>
      </Step>

      <Step n={3} title="Install the Python SDK (optional)">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          For CI integration or notebook-based workflows, install the SDK. Python 3.9+ required.
        </p>
        <CodeBlock>
          <div>
            <span className="text-[#7E8C82]">$ </span>pip install ultros
          </div>
          <div>
            <span className="text-[#7E8C82]">$ </span>ultros auth login{" "}
            <span className="text-[#7E8C82]"># opens browser, stores token</span>
          </div>
        </CodeBlock>
      </Step>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Quickstart"
          desc="Run your first scored evaluation in 5 minutes."
          onClick={() => go("quickstart")}
        />
        <NavCard
          title="Core concepts"
          desc="Prompts, datasets, rubrics, and runs explained."
          onClick={() => go("core-concepts")}
        />
      </div>
    </div>
  )
}

function Quickstart({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Getting started
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Quickstart
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          Run your first scored evaluation in about five minutes. You&apos;ll need an account and an
          API key from at least one model provider.
        </p>
      </div>

      <Step n={1} title="Install the SDK">
        <CodeBlock>
          <span className="text-[#7E8C82]">$ </span>pip install ultros
        </CodeBlock>
      </Step>

      <Step n={2} title="Connect your keys">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Ultros calls providers with your own keys. You pay them directly. Set the ones you plan
          to test against.
        </p>
        <CodeBlock>
          <div>
            <span className="text-[#7E8C82]">$ </span>ultros auth login
          </div>
          <div>
            <span className="text-[#7E8C82]">$ </span>ultros keys add anthropic{" "}
            <span className="text-[#7FD6AE]">sk-ant-…</span>
          </div>
        </CodeBlock>
      </Step>

      <Step n={3} title="Register a prompt and a dataset">
        <CodeBlock>
          <div>
            <span className="text-[#9C7DD4]">import</span> ultros
          </div>
          <div>&nbsp;</div>
          <div>
            ultros.prompts.push(<span className="text-[#7FD6AE]">&quot;support-triage&quot;</span>,
            file=<span className="text-[#7FD6AE]">&quot;triage.md&quot;</span>)
          </div>
          <div>
            ultros.datasets.push(<span className="text-[#7FD6AE]">&quot;tickets-1k&quot;</span>,
            file=<span className="text-[#7FD6AE]">&quot;tickets.jsonl&quot;</span>)
          </div>
        </CodeBlock>
        <Callout>
          Pushing the same name again creates a new version, {" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>support-triage@v2</span>, never an
          overwrite. Old runs stay reproducible.
        </Callout>
      </Step>

      <Step n={4} title="Run the evaluation">
        <CodeBlock>
          <div>run = ultros.evaluate(</div>
          <div className="pl-6">
            prompt=<span className="text-[#7FD6AE]">&quot;support-triage@latest&quot;</span>,
          </div>
          <div className="pl-6">
            dataset=<span className="text-[#7FD6AE]">&quot;tickets-1k&quot;</span>,
          </div>
          <div className="pl-6">
            models=[<span className="text-[#7FD6AE]">&quot;claude-sonnet-4-6&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;gpt-4o&quot;</span>],
          </div>
          <div className="pl-6">
            judge=<span className="text-[#7FD6AE]">&quot;rubric:helpfulness-v2&quot;</span>,
          </div>
          <div>)</div>
          <div>&nbsp;</div>
          <div>
            <span className="text-[#9C7DD4]">print</span>(run.summary()){" "}
            <span className="text-[#7E8C82]"># accuracy, rubric scores, Δ vs previous version</span>
          </div>
        </CodeBlock>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          The run appears in your dashboard as it executes, every row scored, every output stored,
          every delta computed against the last version of the prompt.
        </p>
      </Step>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Judges & rubrics →"
          desc="Define what &quot;good&quot; means for your task."
          onClick={() => go("judges-rubrics")}
        />
        <NavCard
          title="Regression gates →"
          desc="Fail the build when scores drop."
          onClick={() => go("regression-gates")}
        />
      </div>
    </div>
  )
}

function CoreConcepts({ go }: { go: (s: Section) => void }) {
  const concepts = [
    {
      term: "Prompt",
      def: "A named, versioned unit of text stored in Ultros: a system prompt plus a user message template. Each save creates a new version; nothing is ever overwritten.",
    },
    {
      term: "Version",
      def: "An immutable snapshot of a prompt at a point in time. Referenced as name@v3 or name@latest. All runs are tied to a specific version so results stay reproducible.",
    },
    {
      term: "Dataset",
      def: "A collection of rows, each a map of column→value pairs. Rows drive batch evaluation. {{variables}} in the prompt template are filled from dataset columns.",
    },
    {
      term: "Rubric",
      def: "A scoring definition: a list of criteria, each with a weight and a method (AI judge, exact match, regex, JSON schema, or contains). Rubrics are reusable across prompts.",
    },
    {
      term: "Run",
      def: "A single prompt execution against one model. Stores the input, output, token counts, latency, cost, and evaluation score. Runs are the atom of the system.",
    },
    {
      term: "Experiment",
      def: "A comparison across prompt variants × models × a dataset, all scored by the same rubric. Produces a win matrix and per-criterion breakdown.",
    },
    {
      term: "Baseline",
      def: "A pinned (version, dataset, rubric) triple that defines expected performance. Regression runs compare against this to detect score drops.",
    },
  ]

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Getting started
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Core concepts
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          Seven ideas that everything else builds on. Understanding these makes the rest of the
          documentation obvious.
        </p>
      </div>

      <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
        {concepts.map((c) => (
          <div key={c.term} className="py-5 grid grid-cols-[200px_1fr] gap-8 items-baseline">
            <span className={`${mono.className} text-[14px] text-[#7FD6AE] font-medium`}>
              {c.term}
            </span>
            <p className="m-0 text-base leading-[1.65] text-[#9FAFA4]">{c.def}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Datasets →"
          desc="Upload CSV or JSON and map columns to prompt variables."
          onClick={() => go("datasets")}
        />
        <NavCard
          title="Judges & rubrics →"
          desc="Define what a good output looks like."
          onClick={() => go("judges-rubrics")}
        />
      </div>
    </div>
  )
}

function Datasets({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Evaluation
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Datasets
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          A dataset is a list of rows that drive batch evaluation. Each row fills the{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>{"{{variables}}"}</span> in your
          prompt template at run time.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Supported formats</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Upload a <strong className="text-[#ECF1ED] font-semibold">CSV</strong> or{" "}
          <strong className="text-[#ECF1ED] font-semibold">JSON Lines</strong> file from the
          Datasets page, or push programmatically with the SDK.
        </p>
        <CodeBlock>
          <div className="text-[#7E8C82]"># CSV. First row is the header</div>
          <div>input,expected_output</div>
          <div>
            <span className="text-[#7FD6AE]">&quot;Summarise this ticket…&quot;</span>,
            <span className="text-[#7FD6AE]">&quot;Billing issue, high priority&quot;</span>
          </div>
          <div>&nbsp;</div>
          <div className="text-[#7E8C82]"># JSON Lines, one object per line</div>
          <div>
            {'{'}
            <span className="text-[#7FD6AE]">&quot;input&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;Summarise…&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;expected_output&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;Billing…&quot;</span>
            {'}'}
          </div>
        </CodeBlock>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Variable mapping</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Column names become template variables. A column named{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>input</span> fills{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>{"{{input}}"}</span> in your prompt.
          Variable mapping is shown on the dataset detail page before you run.
        </p>
        <div className="bg-[#121815] border border-[#243029] rounded-[10px] overflow-hidden">
          <div className="grid grid-cols-2 gap-4 px-5 py-3 border-b border-[#1B231F] text-xs font-semibold tracking-[0.08em] uppercase text-[#7E8C82]">
            <span>Dataset column</span>
            <span>Prompt variable</span>
          </div>
          {[
            ["input", "{{input}}"],
            ["expected_output", "{{expected_output}}"],
            ["context", "{{context}}"],
          ].map(([col, v]) => (
            <div
              key={col}
              className="grid grid-cols-2 gap-4 px-5 py-3 border-t border-[#1B231F] text-[14.5px]"
            >
              <span className={`${mono.className} text-[#9FAFA4]`}>{col}</span>
              <span className={`${mono.className} text-[#7FD6AE]`}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">SDK upload</h2>
        <CodeBlock>
          <div>
            ultros.datasets.push(
          </div>
          <div className="pl-6">
            <span className="text-[#7FD6AE]">&quot;tickets-1k&quot;</span>,
          </div>
          <div className="pl-6">
            file=<span className="text-[#7FD6AE]">&quot;tickets.jsonl&quot;</span>,
          </div>
          <div className="pl-6">
            description=<span className="text-[#7FD6AE]">&quot;Support ticket sample, June 2026&quot;</span>,
          </div>
          <div>)</div>
        </CodeBlock>
        <Callout>
          Uploading a dataset with the same name creates a new version of it. Existing runs that
          reference the old version are unaffected.
        </Callout>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Judges & rubrics →"
          desc="Score each row's output automatically."
          onClick={() => go("judges-rubrics")}
        />
        <NavCard
          title="REST API →"
          desc="Upload and query datasets over HTTP."
          onClick={() => go("rest-api")}
        />
      </div>
    </div>
  )
}

function JudgesRubrics({ go }: { go: (s: Section) => void }) {
  const methods = [
    {
      name: "ai_judge",
      label: "AI judge",
      desc: "A separate model reads the prompt, output, and your criterion description, then scores 0–10. Best for open-ended quality criteria.",
    },
    {
      name: "exact",
      label: "Exact match",
      desc: "Output must equal the expected_output column value (case-insensitive). Fast and cheap. Use for classification or fixed-answer tasks.",
    },
    {
      name: "regex",
      label: "Regex",
      desc: "Output must match a regular expression you supply. Good for structured outputs like dates, IDs, or formatted numbers.",
    },
    {
      name: "json_schema",
      label: "JSON schema",
      desc: "Output is parsed as JSON and validated against a schema. Any schema validation error scores 0.",
    },
    {
      name: "contains",
      label: "Contains",
      desc: 'Output must contain a literal string. Useful for checking that required disclaimers or phrases appear.',
    },
  ]

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Evaluation
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Judges & rubrics
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          A rubric is a reusable scoring definition: a list of criteria with weights and an overall
          pass threshold. Every run is scored against a rubric automatically.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Criterion methods</h2>
        <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
          {methods.map((m) => (
            <div key={m.name} className="py-4 flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <span className={`${mono.className} text-[13px] text-[#7FD6AE] bg-[#4FB286]/10 border border-[#4FB286]/25 rounded-md px-2 py-0.5`}>
                  {m.name}
                </span>
                <span className="text-base font-semibold">{m.label}</span>
              </div>
              <p className="m-0 text-[14.5px] leading-[1.6] text-[#9FAFA4]">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Example rubric (SDK)</h2>
        <CodeBlock>
          <div>rubric = ultros.rubrics.create(</div>
          <div className="pl-6">
            name=<span className="text-[#7FD6AE]">&quot;helpfulness-v2&quot;</span>,
          </div>
          <div className="pl-6">pass_threshold=<span className="text-[#9C7DD4]">7.5</span>,</div>
          <div className="pl-6">criteria=[</div>
          <div className="pl-12">
            {"{"}
            <span className="text-[#7FD6AE]">&quot;name&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;correctness&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;weight&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">0.5</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;type&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;ai_judge&quot;</span>
            {"}"},
          </div>
          <div className="pl-12">
            {"{"}
            <span className="text-[#7FD6AE]">&quot;name&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;conciseness&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;weight&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">0.3</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;type&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;ai_judge&quot;</span>
            {"}"},
          </div>
          <div className="pl-12">
            {"{"}
            <span className="text-[#7FD6AE]">&quot;name&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;has_disclaimer&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;weight&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">0.2</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;type&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;contains&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;value&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;consult a professional&quot;</span>
            {"}"},
          </div>
          <div className="pl-6">],</div>
          <div>)</div>
        </CodeBlock>
        <Callout>
          Weights must sum to 1.0. The final score is the weighted average across all criteria,
          scaled to 0–10. A run passes if the score meets or exceeds{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>pass_threshold</span>.
        </Callout>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Calibration →"
          desc="Verify your AI judge scores what you think it scores."
          onClick={() => go("calibration")}
        />
        <NavCard
          title="Regression gates →"
          desc="Block deploys when rubric scores drop."
          onClick={() => go("regression-gates")}
        />
      </div>
    </div>
  )
}

function Calibration({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Evaluation
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Calibration
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          An AI judge is only useful if it scores consistently. Calibration is the process of
          verifying that your rubric measures what you intend before you rely on it for regression
          detection.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">What to check</h2>
        <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
          {[
            {
              title: "Score distribution",
              desc: "A well-calibrated rubric uses the full 0–10 range across a diverse dataset. If every row scores 7.8–8.2, your criteria are too coarse to detect regressions.",
            },
            {
              title: "Agreement with human labels",
              desc: "Score 20–30 rows yourself, then compare. If the AI judge's ranking matches your intuition on ~80% of pairs, it's reliable enough for gating.",
            },
            {
              title: "Stability across re-runs",
              desc: "Run the same dataset twice with the same rubric. Variance in AI-judge scores should be under ±0.3 on most rows. High variance means the criterion prompt is ambiguous.",
            },
            {
              title: "Sensitivity to known changes",
              desc: "Create a deliberately worse prompt version (e.g., remove key instructions). The rubric should score it measurably lower. If it doesn't, the criterion is not capturing that dimension.",
            },
          ].map((item) => (
            <div key={item.title} className="py-4 flex flex-col gap-1">
              <span className="text-base font-semibold">{item.title}</span>
              <p className="m-0 text-[14.5px] leading-[1.6] text-[#9FAFA4]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Calibration run (SDK)</h2>
        <CodeBlock>
          <div className="text-[#7E8C82]"># Score a small gold set with your rubric</div>
          <div>cal = ultros.calibrate(</div>
          <div className="pl-6">
            rubric=<span className="text-[#7FD6AE]">&quot;helpfulness-v2&quot;</span>,
          </div>
          <div className="pl-6">
            gold_set=<span className="text-[#7FD6AE]">&quot;gold-50.jsonl&quot;</span>,
            <span className="text-[#7E8C82]"> # rows with human_score column</span>
          </div>
          <div>)</div>
          <div>&nbsp;</div>
          <div>
            <span className="text-[#9C7DD4]">print</span>(cal.correlation){" "}
            <span className="text-[#7E8C82]"># Spearman ρ vs human labels</span>
          </div>
          <div>
            <span className="text-[#9C7DD4]">print</span>(cal.variance){" "}
            <span className="text-[#7E8C82]"># avg score variance across 3 reruns</span>
          </div>
        </CodeBlock>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Judges & rubrics →"
          desc="Build and refine your scoring criteria."
          onClick={() => go("judges-rubrics")}
        />
        <NavCard
          title="Regression gates →"
          desc="Put your calibrated rubric to work in CI."
          onClick={() => go("regression-gates")}
        />
      </div>
    </div>
  )
}

function RegressionGates({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Evaluation
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Regression gates
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          A regression gate compares a new prompt version against a pinned baseline and fails the
          build if the score drops past a threshold. Ship prompt changes with confidence.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">1. Pin a baseline</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          A baseline is a (prompt version, dataset, rubric) triple that defines expected
          performance. Set it from the dashboard or via the SDK after a run you&apos;re satisfied with.
        </p>
        <CodeBlock>
          <div>
            ultros.baseline.set(
          </div>
          <div className="pl-6">
            prompt=<span className="text-[#7FD6AE]">&quot;support-triage@v13&quot;</span>,
          </div>
          <div className="pl-6">
            dataset=<span className="text-[#7FD6AE]">&quot;tickets-1k&quot;</span>,
          </div>
          <div className="pl-6">
            rubric=<span className="text-[#7FD6AE]">&quot;helpfulness-v2&quot;</span>,
          </div>
          <div>)</div>
        </CodeBlock>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">2. Gate in CI</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Call <span className={`${mono.className} text-[#7FD6AE]`}>ultros.regression</span> in
          your CI pipeline. It exits non-zero if the new version scores below the threshold.
        </p>
        <CodeBlock>
          <div className="text-[#7E8C82]"># GitHub Actions step</div>
          <div>- <span className="text-[#7FD6AE]">name</span>: Check prompt regression</div>
          <div className="pl-4">
            <span className="text-[#7FD6AE]">run</span>: |
          </div>
          <div className="pl-8">
            ultros regression check \
          </div>
          <div className="pl-10">
            --prompt support-triage@latest \
          </div>
          <div className="pl-10">
            --baseline support-triage@v13 \
          </div>
          <div className="pl-10">
            --min-delta <span className="text-[#9C7DD4]">-0.5</span>
            <span className="text-[#7E8C82]">  # fail if score drops &gt; 0.5</span>
          </div>
        </CodeBlock>
        <Callout>
          The regression run stores the full per-row breakdown in your dashboard. You can drill
          into exactly which rows regressed and inspect the outputs side-by-side.
        </Callout>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">SDK usage</h2>
        <CodeBlock>
          <div>result = ultros.regression.check(</div>
          <div className="pl-6">
            new_version=<span className="text-[#7FD6AE]">&quot;support-triage@latest&quot;</span>,
          </div>
          <div className="pl-6">
            min_delta=<span className="text-[#9C7DD4]">-0.5</span>,
          </div>
          <div>)</div>
          <div>&nbsp;</div>
          <div>
            <span className="text-[#9C7DD4]">if</span> result.regressed:
          </div>
          <div className="pl-6">
            <span className="text-[#9C7DD4]">print</span>(
            <span className="text-[#7FD6AE]">f&quot;Score dropped {"{result.delta:.2f}"} on {"{len(result.regressed_rows)}"} rows&quot;</span>
            )
          </div>
          <div className="pl-6">
            raise SystemExit(<span className="text-[#9C7DD4]">1</span>)
          </div>
        </CodeBlock>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="CLI →"
          desc="Full reference for the regression subcommand."
          onClick={() => go("cli")}
        />
        <NavCard
          title="Core concepts →"
          desc="Baselines and experiments explained."
          onClick={() => go("core-concepts")}
        />
      </div>
    </div>
  )
}

function PythonSDK({ go }: { go: (s: Section) => void }) {
  const classes = [
    {
      name: "ultros.prompts",
      methods: [
        { sig: "push(name, file=None, text=None, description=None)", desc: "Create or version a prompt. Returns the new PromptVersion." },
        { sig: "list()", desc: "List all prompts in the workspace." },
        { sig: "get(name, version='latest')", desc: "Fetch a specific prompt version." },
      ],
    },
    {
      name: "ultros.datasets",
      methods: [
        { sig: "push(name, file, description=None)", desc: "Upload a CSV or JSONL dataset." },
        { sig: "list()", desc: "List all datasets." },
        { sig: "get(name)", desc: "Fetch dataset metadata and row count." },
      ],
    },
    {
      name: "ultros.rubrics",
      methods: [
        { sig: "create(name, criteria, pass_threshold=7.0)", desc: "Create a rubric with a list of criterion dicts." },
        { sig: "list()", desc: "List all rubrics." },
        { sig: "get(name)", desc: "Fetch rubric definition." },
      ],
    },
    {
      name: "ultros",
      methods: [
        { sig: "evaluate(prompt, dataset, models, judge, **kwargs)", desc: "Run a batch evaluation. Returns a Run object." },
        { sig: "regression.check(new_version, min_delta=-0.5)", desc: "Compare against the pinned baseline. Returns RegressionResult." },
        { sig: "baseline.set(prompt, dataset, rubric)", desc: "Pin a baseline for regression gating." },
        { sig: "calibrate(rubric, gold_set)", desc: "Measure judge consistency against human labels." },
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Reference
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          Python SDK
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          Python 3.9+. Install with{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>pip install ultros</span>. All
          methods are synchronous by default; async variants are available with the{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>ultros.aio</span> namespace.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Authentication</h2>
        <CodeBlock>
          <div className="text-[#7E8C82]"># Authenticate via browser (one-time)</div>
          <div>
            <span className="text-[#7E8C82]">$ </span>ultros auth login
          </div>
          <div>&nbsp;</div>
          <div className="text-[#7E8C82]"># Or set token directly</div>
          <div>
            <span className="text-[#9C7DD4]">import</span> ultros
          </div>
          <div>
            ultros.api_key = <span className="text-[#7FD6AE]">&quot;ultr_…&quot;</span>
            <span className="text-[#7E8C82]">  # or ULTROS_API_KEY env var</span>
          </div>
        </CodeBlock>
      </div>

      {classes.map((cls) => (
        <div key={cls.name} className="flex flex-col gap-3">
          <h2 className={`${mono.className} m-0 text-lg font-medium text-[#7FD6AE]`}>{cls.name}</h2>
          <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
            {cls.methods.map((m) => (
              <div key={m.sig} className="py-3.5 flex flex-col gap-1">
                <span className={`${mono.className} text-[13.5px] text-[#ECF1ED]`}>{m.sig}</span>
                <p className="m-0 text-[14px] leading-[1.6] text-[#9FAFA4]">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard title="CLI →" desc="Command-line interface reference." onClick={() => go("cli")} />
        <NavCard
          title="REST API →"
          desc="HTTP API for non-Python integrations."
          onClick={() => go("rest-api")}
        />
      </div>
    </div>
  )
}

function CLI({ go }: { go: (s: Section) => void }) {
  const commands = [
    {
      group: "Authentication",
      cmds: [
        { cmd: "ultros auth login", desc: "Authenticate via browser. Stores a token in ~/.ultros." },
        { cmd: "ultros auth logout", desc: "Remove stored credentials." },
        { cmd: "ultros auth status", desc: "Show the currently authenticated user." },
      ],
    },
    {
      group: "Keys",
      cmds: [
        { cmd: "ultros keys add <provider> <key>", desc: "Add a model provider API key." },
        { cmd: "ultros keys list", desc: "List configured providers." },
        { cmd: "ultros keys remove <provider>", desc: "Remove a provider key." },
      ],
    },
    {
      group: "Prompts",
      cmds: [
        { cmd: "ultros prompts push <name> <file>", desc: "Create or version a prompt from a file." },
        { cmd: "ultros prompts list", desc: "List all prompts." },
        { cmd: "ultros prompts diff <name> v12 v13", desc: "Show a text diff between two versions." },
      ],
    },
    {
      group: "Datasets",
      cmds: [
        { cmd: "ultros datasets push <name> <file>", desc: "Upload a CSV or JSONL dataset." },
        { cmd: "ultros datasets list", desc: "List all datasets." },
      ],
    },
    {
      group: "Evaluation",
      cmds: [
        { cmd: "ultros eval run --prompt <p> --dataset <d> --rubric <r>", desc: "Launch a batch evaluation and stream progress." },
        { cmd: "ultros eval status <run-id>", desc: "Check status of an in-progress run." },
        { cmd: "ultros eval results <run-id>", desc: "Print aggregate results for a completed run." },
      ],
    },
    {
      group: "Regression",
      cmds: [
        { cmd: "ultros regression check --prompt <p> --baseline <b> --min-delta <n>", desc: "Run against the baseline; exit 1 if regressed." },
        { cmd: "ultros regression history --prompt <p>", desc: "Print score-over-time for all regression runs." },
        { cmd: "ultros baseline set --prompt <p> --dataset <d> --rubric <r>", desc: "Pin the current latest as the baseline." },
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Reference
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          CLI
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          The Ultros CLI is installed as part of the Python SDK. All commands accept{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>--json</span> for
          machine-readable output and{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>--help</span> for inline usage.
        </p>
      </div>

      {commands.map((group) => (
        <div key={group.group} className="flex flex-col gap-3">
          <h2 className="m-0 text-[18px] font-semibold tracking-tight text-[#ECF1ED]">
            {group.group}
          </h2>
          <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
            {group.cmds.map((c) => (
              <div key={c.cmd} className="py-3.5 flex flex-col gap-1">
                <span className={`${mono.className} text-[13px] text-[#ECF1ED] bg-[#121815] border border-[#243029] rounded-md px-3 py-1.5 self-start`}>
                  {c.cmd}
                </span>
                <p className="m-0 text-[14px] leading-[1.6] text-[#9FAFA4]">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Python SDK →"
          desc="Programmatic access from scripts and notebooks."
          onClick={() => go("python-sdk")}
        />
        <NavCard
          title="REST API →"
          desc="HTTP endpoints for any language."
          onClick={() => go("rest-api")}
        />
      </div>
    </div>
  )
}

function RestAPI({ go }: { go: (s: Section) => void }) {
  const endpoints = [
    { method: "GET", path: "/api/prompts", desc: "List all prompts for the authenticated user." },
    { method: "POST", path: "/api/prompts", desc: "Create a new prompt. Body: { title, description }." },
    { method: "GET", path: "/api/prompts/:id/versions", desc: "List all versions of a prompt." },
    { method: "POST", path: "/api/prompts/:id/versions", desc: "Save a new version. Body: { systemPrompt, userPrompt, variables }." },
    { method: "POST", path: "/api/run", desc: "Execute a prompt version. Streams the response via SSE." },
    { method: "GET", path: "/api/datasets", desc: "List all datasets." },
    { method: "POST", path: "/api/datasets", desc: "Upload a dataset. Multipart form: file + metadata." },
    { method: "GET", path: "/api/datasets/:id", desc: "Fetch dataset metadata and rows." },
    { method: "POST", path: "/api/datasets/:id/run", desc: "Launch a batch evaluation run." },
    { method: "GET", path: "/api/rubrics", desc: "List all rubrics." },
    { method: "POST", path: "/api/rubrics", desc: "Create a rubric. Body: { name, criteria, passThreshold }." },
    { method: "POST", path: "/api/experiments", desc: "Create and launch an experiment." },
    { method: "GET", path: "/api/experiments/:id", desc: "Get experiment status and aggregate results." },
    { method: "GET", path: "/api/experiments/:id/results", desc: "Per-variant/model breakdown." },
    { method: "POST", path: "/api/prompts/:id/baseline", desc: "Pin a baseline. Body: { promptVersionId, datasetId, rubricId }." },
    { method: "POST", path: "/api/prompts/:id/regression", desc: "Run regression check against the pinned baseline." },
    { method: "GET", path: "/api/prompts/:id/regression/history", desc: "Score-over-time for all regression runs." },
    { method: "GET", path: "/api/usage", desc: "Usage stats for the authenticated user." },
    { method: "POST", path: "/api/share", desc: "Create a read-only public share link." },
  ]

  const methodColor: Record<string, string> = {
    GET: "text-[#7FD6AE] bg-[#4FB286]/10 border-[#4FB286]/25",
    POST: "text-[#9C7DD4] bg-[#9C7DD4]/10 border-[#9C7DD4]/25",
    PATCH: "text-[#E4BC7A] bg-[#D9A24E]/10 border-[#D9A24E]/25",
    DELETE: "text-[#E0938A] bg-[#D26A5D]/10 border-[#D26A5D]/25",
  }

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3.5">
        <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
          Reference
        </span>
        <h1 className={`${serif.className} m-0 text-[44px] font-medium tracking-tight leading-[1.12]`}>
          REST API
        </h1>
        <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">
          All endpoints require a{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>Bearer</span> token in the{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>Authorization</span> header.
          Responses follow the shape{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>
            {"{ data: …, error: null }"}
          </span>{" "}
          or{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>
            {'{ data: null, error: "message" }'}
          </span>
          .
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Authentication</h2>
        <CodeBlock>
          <div>
            <span className="text-[#7E8C82]">$ </span>curl https://ultros.app/api/prompts \
          </div>
          <div className="pl-6">
            -H <span className="text-[#7FD6AE]">&quot;Authorization: Bearer ultr_…&quot;</span>
          </div>
        </CodeBlock>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Endpoints</h2>
        <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
          {endpoints.map((e) => (
            <div key={e.method + e.path} className="py-3 flex items-baseline gap-3">
              <span
                className={`${mono.className} text-[12px] font-semibold border rounded px-1.5 py-0.5 shrink-0 ${methodColor[e.method] ?? ""}`}
              >
                {e.method}
              </span>
              <span className={`${mono.className} text-[13.5px] text-[#ECF1ED] shrink-0`}>
                {e.path}
              </span>
              <span className="text-[13.5px] text-[#7E8C82]">{e.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Python SDK →"
          desc="Higher-level client with auth built in."
          onClick={() => go("python-sdk")}
        />
        <NavCard
          title="CLI →"
          desc="Terminal interface to the same API."
          onClick={() => go("cli")}
        />
      </div>
    </div>
  )
}

const contentMap: Record<Section, (props: { go: (s: Section) => void }) => React.ReactElement> = {
  installation: Installation,
  quickstart: Quickstart,
  "core-concepts": CoreConcepts,
  datasets: Datasets,
  "judges-rubrics": JudgesRubrics,
  calibration: Calibration,
  "regression-gates": RegressionGates,
  "python-sdk": PythonSDK,
  cli: CLI,
  "rest-api": RestAPI,
}

export default function DocsPage() {
  const [active, setActive] = useState<Section>("quickstart")
  const Content = contentMap[active]

  return (
    <div className={`${sans.className} min-h-screen bg-[#0B0F0D] text-[#ECF1ED] selection:bg-[#4FB286]/35`}>
      {/* Nav */}
      <nav className="max-w-[1120px] mx-auto px-8 py-7 flex items-center justify-between border-b border-[#1B231F]">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[#ECF1ED] no-underline"
        >
          <UltrosLogo />
          <span className={`${serif.className} text-[22px] font-semibold tracking-tight`}>
            Ultros
          </span>
          <span className="text-[14px] font-medium text-[#7E8C82] border-l border-[#243029] pl-2.5 ml-0.5">
            Docs
          </span>
        </Link>
        <div className="flex items-center gap-8">
          <Link
            href="/#product"
            className="text-[15px] font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors whitespace-nowrap"
          >
            Product
          </Link>
          <Link
            href="/docs"
            className="text-[15px] font-semibold text-[#ECF1ED] whitespace-nowrap"
          >
            Docs
          </Link>
          <Link
            href="/sign-in"
            className="text-[15px] font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors whitespace-nowrap"
          >
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

      {/* Body */}
      <div className="max-w-[1120px] mx-auto px-8 grid grid-cols-[230px_1fr] gap-16 items-start">
        {/* Sidebar */}
        <aside className="sticky top-0 py-12 flex flex-col gap-8">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2.5">
              <span className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#7E8C82]">
                {group.label}
              </span>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={`text-[15px] text-left py-[3px] transition-colors ${
                    active === item.id
                      ? "font-semibold text-[#7FD6AE] pl-3 -ml-3 border-l-2 border-[#4FB286] bg-[#4FB286]/[0.07]"
                      : "font-normal text-[#9FAFA4] hover:text-[#ECF1ED] pl-0"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main className="py-12 pb-[110px] max-w-[720px]">
          <Content go={setActive} />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1B231F]">
        <div className="max-w-[1120px] mx-auto px-8 py-9 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UltrosLogo size={20} />
            <span className={`${serif.className} text-lg font-semibold`}>Ultros</span>
          </div>
          <div className="flex items-center gap-7">
            <Link href="/docs" className="text-sm text-[#7E8C82] hover:text-[#9FAFA4] transition-colors">
              Docs
            </Link>
            <span className="text-sm text-[#7E8C82]">An AI evaluation platform. Every run scored, every regression caught.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
