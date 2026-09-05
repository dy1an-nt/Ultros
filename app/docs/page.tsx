"use client"

import { useState } from "react"
import Link from "next/link"
import { Hanken_Grotesk, Source_Serif_4, Spline_Sans_Mono } from "next/font/google"
import { UltrosLogo } from "@/components/landing/Logo"
import { MODEL_CATALOG } from "@/lib/ai/models"

const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"] })
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500", "600"] })

type Section =
  | "overview"
  | "quickstart"
  | "core-concepts"
  | "datasets"
  | "judges-rubrics"
  | "calibration"
  | "regression"
  | "models"
  | "rest-api"
  | "roadmap"

const sidebarGroups = [
  {
    label: "Getting started",
    items: [
      { id: "overview" as Section, label: "Overview" },
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
      { id: "regression" as Section, label: "Regression testing" },
    ],
  },
  {
    label: "Reference",
    items: [
      { id: "models" as Section, label: "Models & pricing" },
      { id: "rest-api" as Section, label: "REST API" },
      { id: "roadmap" as Section, label: "Roadmap" },
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
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <circle cx="12" cy="15.5" r="0.5" />
      </svg>
      <p className="text-[14.5px] leading-[1.6] text-[#9FAFA4]">{children}</p>
    </div>
  )
}

// Marks a capability that is described but not built, so a reader never has to
// guess which parts of this page they can actually use today.
function NotBuilt({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#D9A24E]/[0.08] border border-[#D9A24E]/30 rounded-[10px] p-4 flex flex-col gap-1.5">
      <span className={`${mono.className} text-[12px] tracking-[0.1em] uppercase text-[#E4BC7A]`}>
        Not built yet
      </span>
      <p className="m-0 text-[14.5px] leading-[1.6] text-[#9FAFA4]">{children}</p>
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

function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5">
      <span className={`${mono.className} text-[13px] tracking-[0.1em] uppercase text-[#7FD6AE]`}>
        {eyebrow}
      </span>
      <h1 className={`${serif.className} m-0 text-[32px] sm:text-[44px] font-medium tracking-tight leading-[1.12]`}>
        {title}
      </h1>
      <p className="m-0 text-[17px] leading-[1.65] text-[#9FAFA4]">{children}</p>
    </div>
  )
}

function Overview({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Getting started" title="Overview">
        Ultros is a web app for evaluating prompts. There is nothing to install and no client
        library to add. You write a prompt in the browser, run it against a model, and every run is
        stored with its tokens, latency, cost, and score.
      </PageHeader>

      <Step n={1} title="Create an account">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Sign up at{" "}
          <Link href="/sign-up" className="text-[#7FD6AE] underline underline-offset-2">
            /sign-up
          </Link>
          . Your account owns your prompts, datasets, rubrics, experiments, and usage history, and
          every query is scoped to it. No other account can read your data.
        </p>
      </Step>

      <Step n={2} title="See which models you can reach">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Model access is configured once, on the server, by whoever runs the deployment. The model
          picker lists exactly the models whose provider is configured, so anything you can select
          is something the app can actually call. Nothing is advertised that would fail at run time.
        </p>
        <Callout>
          There is no per-account key management. You cannot add your own provider key from
          Settings, and Ultros never asks you for one. See{" "}
          <button onClick={() => go("roadmap")} className="text-[#7FD6AE] underline underline-offset-2">
            Roadmap
          </button>{" "}
          for what that means today.
        </Callout>
      </Step>

      <Step n={3} title="Know the limits">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Requests are rate limited per account, in a sliding 60 second window. Exceeding a limit
          returns HTTP 429 with a <span className={`${mono.className} text-[#7FD6AE]`}>Retry-After</span>{" "}
          header rather than silently dropping work.
        </p>
        <div className="bg-[#121815] border border-[#243029] rounded-[10px] overflow-hidden">
          {[
            ["Single runs and comparisons", "30 / min"],
            ["Manual eval triggers", "60 / min"],
            ["Batch launches (dataset, experiment, regression)", "5 / min"],
            ["Create, update, delete", "60 / min"],
            ["Public share views", "60 / min per IP"],
          ].map(([what, limit]) => (
            <div
              key={what}
              className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 border-b border-[#1B231F] last:border-b-0 text-[14.5px]"
            >
              <span className="text-[#9FAFA4]">{what}</span>
              <span className={`${mono.className} text-[#7FD6AE]`}>{limit}</span>
            </div>
          ))}
        </div>
      </Step>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Quickstart"
          desc="Run your first scored evaluation."
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
      <PageHeader eyebrow="Getting started" title="Quickstart">
        From an empty account to a scored batch run, entirely in the browser. Each step below is a
        page in the app.
      </PageHeader>

      <Step n={1} title="Write a prompt">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Go to{" "}
          <Link href="/prompts/new" className="text-[#7FD6AE] underline underline-offset-2">
            /prompts/new
          </Link>
          . A prompt has a system prompt and a user prompt, both edited in CodeMirror. Anywhere you
          write <span className={`${mono.className} text-[#7FD6AE]`}>{"{{name}}"}</span> becomes a
          variable you can fill from a dataset column later.
        </p>
      </Step>

      <Step n={2} title="Run it">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Pick a model, set max output tokens, and run. The response streams into the page as it
          arrives. When it finishes, the run is saved with its input and output token counts,
          latency, and cost in USD, and it appears in the run history under the prompt.
        </p>
        <Callout>
          Temperature is disabled for models that no longer accept one. Rather than sending a value
          the provider would reject, Ultros omits it and the control greys out. See{" "}
          <button onClick={() => go("models")} className="text-[#7FD6AE] underline underline-offset-2">
            Models &amp; pricing
          </button>
          .
        </Callout>
      </Step>

      <Step n={3} title="Save a version">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Saving snapshots the current text as version 1, then 2, then 3. Versions are immutable and
          numbered per prompt. Every run records the version it came from, so a result stays
          traceable to the exact text that produced it. The version list diffs the user prompt
          between any two versions, and restoring loads an older version back into the editor, where
          saving it creates a new version rather than rewriting history.
        </p>
      </Step>

      <Step n={4} title="Define a rubric">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          At{" "}
          <Link href="/rubrics" className="text-[#7FD6AE] underline underline-offset-2">
            /rubrics
          </Link>
          , build a scoring definition: up to 20 criteria, each with a weight and a method. Scores
          are on a 0 to 1 scale, and a run passes when its weighted score meets the rubric&apos;s
          pass threshold.
        </p>
      </Step>

      <Step n={5} title="Run across a dataset">
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Upload a CSV or JSON dataset at{" "}
          <Link href="/datasets" className="text-[#7FD6AE] underline underline-offset-2">
            /datasets
          </Link>
          , map its columns to your prompt variables, and launch. Ultros shows a cost estimate and
          asks you to confirm before spending anything. Rows are queued and run in the background,
          each one scored against the rubric, with live progress, aggregate metrics, per-row
          drill-down, and CSV export.
        </p>
      </Step>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Judges & rubrics"
          desc="Define what good means for your task."
          onClick={() => go("judges-rubrics")}
        />
        <NavCard
          title="Regression testing"
          desc="Catch the version that made things worse."
          onClick={() => go("regression")}
        />
      </div>
    </div>
  )
}

function CoreConcepts({ go }: { go: (s: Section) => void }) {
  const concepts = [
    {
      term: "Prompt",
      def: "A named, versioned unit of text: a system prompt plus a user prompt template. Each save creates a new version; nothing is overwritten.",
    },
    {
      term: "Version",
      def: "An immutable snapshot of a prompt, numbered from 1 within that prompt and optionally labelled. Every run stores the version it ran, so results stay reproducible.",
    },
    {
      term: "Dataset",
      def: "Up to 500 rows, each a map of column to value, plus an optional expected output. Rows drive batch evaluation and fill the {{variables}} in a prompt. Datasets are immutable once created.",
    },
    {
      term: "Rubric",
      def: "A reusable scoring definition: up to 20 criteria, each with a weight and a method (AI judge, exact, regex, JSON schema, or contains), plus a pass threshold between 0 and 1.",
    },
    {
      term: "Run",
      def: "A single prompt execution against one model. Stores the response, input and output token counts, latency, and cost in USD. Runs are the atom of the system.",
    },
    {
      term: "Experiment",
      def: "Prompt variants crossed with up to 3 models over one dataset, all scored by the same rubric. Produces a win matrix and a per-criterion breakdown.",
    },
    {
      term: "Baseline",
      def: "A pinned prompt version, dataset, and rubric that together define expected performance. Regression runs re-run that combination and compare.",
    },
  ]

  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Getting started" title="Core concepts">
        Seven ideas that everything else builds on. Understanding these makes the rest of the
        documentation obvious.
      </PageHeader>

      <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
        {concepts.map((c) => (
          <div
            key={c.term}
            className="py-5 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 sm:gap-8 items-baseline"
          >
            <span className={`${mono.className} text-[14px] text-[#7FD6AE] font-medium`}>
              {c.term}
            </span>
            <p className="m-0 text-base leading-[1.65] text-[#9FAFA4]">{c.def}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Datasets"
          desc="Upload CSV or JSON and map columns to variables."
          onClick={() => go("datasets")}
        />
        <NavCard
          title="Judges & rubrics"
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
      <PageHeader eyebrow="Evaluation" title="Datasets">
        A dataset is a list of rows that drive batch evaluation. Each row fills the{" "}
        <span className={`${mono.className} text-[#7FD6AE]`}>{"{{variables}}"}</span> in your prompt
        template at run time.
      </PageHeader>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Supported formats</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Paste or upload <strong className="text-[#ECF1ED] font-semibold">CSV</strong> with a header
          row, or a <strong className="text-[#ECF1ED] font-semibold">JSON array of objects</strong>.
          Newline-delimited JSON is not parsed; wrap your objects in an array.
        </p>
        <CodeBlock>
          <div className="text-[#7E8C82]"># CSV. First row is the header</div>
          <div>input,expectedOutput</div>
          <div>
            <span className="text-[#7FD6AE]">&quot;Summarise this ticket…&quot;</span>,
            <span className="text-[#7FD6AE]">&quot;Billing issue, high priority&quot;</span>
          </div>
          <div>&nbsp;</div>
          <div className="text-[#7E8C82]"># JSON. An array of flat objects</div>
          <div>[</div>
          <div className="pl-4">
            {"{"}
            <span className="text-[#7FD6AE]">&quot;input&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;Summarise…&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;expectedOutput&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;Billing…&quot;</span>
            {"}"}
          </div>
          <div>]</div>
        </CodeBlock>
        <Callout>
          <span className={`${mono.className} text-[#7FD6AE]`}>expectedOutput</span> is a reserved
          column name, spelled exactly that way. It is stored beside the row rather than as a
          template variable, and it is what per-row comparison reads.
        </Callout>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Limits</h2>
        <div className="bg-[#121815] border border-[#243029] rounded-[10px] overflow-hidden">
          {[
            ["Rows", "500"],
            ["Columns, not counting expectedOutput", "20"],
            ["Column name length", "1 to 50 characters"],
            ["Column name characters", "letters, digits, underscore, space, hyphen"],
          ].map(([what, limit]) => (
            <div
              key={what}
              className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 border-b border-[#1B231F] last:border-b-0 text-[14.5px]"
            >
              <span className="text-[#9FAFA4]">{what}</span>
              <span className={`${mono.className} text-[#7FD6AE] text-right`}>{limit}</span>
            </div>
          ))}
        </div>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Duplicate column names are rejected rather than silently renamed, and a row whose field
          count does not match the header fails the upload with the offending row number.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Variable mapping</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Column names become template variables. A column named{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>input</span> fills{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>{"{{input}}"}</span> in your prompt.
          The mapping is shown in the run dialog before you launch, so you can see which variable
          each column feeds. A variable with no matching column resolves to an empty string.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Immutability</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          A dataset cannot be edited after it is created, and rows keep their original index. That
          is what lets a regression run match rows one to one against a baseline months later.
          Uploading a corrected file creates a separate dataset rather than a new version of the
          existing one. A dataset cannot be deleted while runs still reference it.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Judges & rubrics"
          desc="Score each row's output automatically."
          onClick={() => go("judges-rubrics")}
        />
        <NavCard
          title="REST API"
          desc="The exact request body the upload uses."
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
      desc: "A judge model reads the response and your criterion instructions, then returns a score between 0 and 1 with a one-sentence reason. Best for open-ended quality criteria. Config: instructions, up to 2000 characters.",
    },
    {
      name: "exact",
      label: "Exact match",
      desc: "The response must equal a literal string you supply. Case-sensitive unless you turn that off, with optional trimming. Scores 1 or 0. Config: expected, caseSensitive, trim.",
    },
    {
      name: "regex",
      label: "Regex",
      desc: "The response must match a regular expression. Only the i, m, s, and u flags are allowed, and only the first 100 KB of the response is tested. Scores 1 or 0. Config: pattern, flags.",
    },
    {
      name: "json_schema",
      label: "JSON schema",
      desc: "The response is parsed as JSON and validated against your schema. Unparseable JSON or any validation error scores 0. Config: schema, up to 10 KB serialized.",
    },
    {
      name: "contains",
      label: "Contains",
      desc: "The response must contain a literal substring. Useful for checking that a required disclaimer appears. Scores 1 or 0. Config: substring, caseSensitive.",
    },
  ]

  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Evaluation" title="Judges & rubrics">
        A rubric is a reusable scoring definition: a list of criteria with weights and a pass
        threshold. Attach one to a run and the run is scored automatically.
      </PageHeader>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">The scale</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Every score in Ultros is a number between 0 and 1. Deterministic criteria return exactly 0
          or 1. AI judge criteria return anything in between. The total is the weighted mean,{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>Σ(weightᵢ × scoreᵢ) / Σ(weightᵢ)</span>
          , so weights are relative and do not need to add up to anything in particular. A weight of
          2 simply counts twice as much as a weight of 1.
        </p>
        <Callout>
          A run passes when its total score is at or above the rubric&apos;s{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>passThreshold</span>, itself a number
          between 0 and 1.
        </Callout>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Criterion methods</h2>
        <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
          {methods.map((m) => (
            <div key={m.name} className="py-4 flex flex-col gap-1.5">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`${mono.className} text-[13px] text-[#7FD6AE] bg-[#4FB286]/10 border border-[#4FB286]/25 rounded-md px-2 py-0.5`}
                >
                  {m.name}
                </span>
                <span className="text-base font-semibold">{m.label}</span>
              </div>
              <p className="m-0 text-[14.5px] leading-[1.6] text-[#9FAFA4]">{m.desc}</p>
            </div>
          ))}
        </div>
        <Callout>
          Deterministic criteria compare against a literal you put in the criterion, not against the
          dataset&apos;s{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>expectedOutput</span> column. A rubric
          is reusable across datasets, so it carries its own expectations.
        </Callout>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Example rubric</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Built in the rubric builder, or posted to{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>/api/rubrics</span> as this body.
          Every criterion has a name, a type, a weight, and a{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>config</span> object whose shape
          depends on the type.
        </p>
        <CodeBlock>
          <div>{"{"}</div>
          <div className="pl-4">
            <span className="text-[#7FD6AE]">&quot;name&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;helpfulness&quot;</span>,
          </div>
          <div className="pl-4">
            <span className="text-[#7FD6AE]">&quot;passThreshold&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">0.75</span>,
          </div>
          <div className="pl-4">
            <span className="text-[#7FD6AE]">&quot;criteria&quot;</span>: [
          </div>
          <div className="pl-8">
            {"{ "}
            <span className="text-[#7FD6AE]">&quot;name&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;correctness&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;type&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;ai_judge&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;weight&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">5</span>,
          </div>
          <div className="pl-10">
            <span className="text-[#7FD6AE]">&quot;config&quot;</span>: {"{ "}
            <span className="text-[#7FD6AE]">&quot;instructions&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;Is the ticket category right?&quot;</span>
            {" }"} {"}"},
          </div>
          <div className="pl-8">
            {"{ "}
            <span className="text-[#7FD6AE]">&quot;name&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;has_disclaimer&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;type&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;contains&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;weight&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">2</span>,
          </div>
          <div className="pl-10">
            <span className="text-[#7FD6AE]">&quot;config&quot;</span>: {"{ "}
            <span className="text-[#7FD6AE]">&quot;substring&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;consult a professional&quot;</span>
            {" }"} {"}"}
          </div>
          <div className="pl-4">]</div>
          <div>{"}"}</div>
        </CodeBlock>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">How judging runs</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Deterministic criteria are scored inline. AI judge criteria are queued as a background job
          and never block a request, so a batch of 500 rows does not hold a connection open. All the
          AI judge criteria in one rubric are scored in a single judge call, which keeps them
          internally consistent and cheaper than one call each. The judge call is billed like any
          other run and shows up in your usage.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Calibration"
          desc="Check your judge scores what you think it scores."
          onClick={() => go("calibration")}
        />
        <NavCard
          title="Regression testing"
          desc="Detect when a new version scores worse."
          onClick={() => go("regression")}
        />
      </div>
    </div>
  )
}

function Calibration({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Evaluation" title="Calibration">
        An AI judge is only useful if it scores consistently. Calibration is the practice of
        checking that a rubric measures what you intend before you rely on it to gate a change.
      </PageHeader>

      <NotBuilt>
        Calibration is a method you carry out with the features described below, not a button. There
        is no calibration command and no automatic correlation report. Everything on this page is
        something you do by running the app and reading the numbers it already produces.
      </NotBuilt>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">What to check</h2>
        <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
          {[
            {
              title: "Score distribution",
              desc: "Run your rubric over a varied dataset and look at the per-row scores in the drill-down. A rubric whose rows all land between 0.78 and 0.82 is too coarse to detect a regression, because a real drop will not clear the threshold.",
            },
            {
              title: "Agreement with your own judgement",
              desc: "Score 20 to 30 rows yourself, then export the run to CSV and compare. What matters is whether the judge ranks the same rows better and worse than you do, not whether it picks the same number.",
            },
            {
              title: "Stability across re-runs",
              desc: "Launch the same dataset, prompt version, and rubric twice. The aggregate view reports sample variance across rows, and a per-row score that moves noticeably between identical runs usually means the criterion instructions are ambiguous.",
            },
            {
              title: "Sensitivity to a known change",
              desc: "Save a deliberately worse version, for example with a key instruction removed, and run it against the same rubric. If the score does not drop, the rubric is not measuring the dimension you changed, and it will not catch a real regression either.",
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
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Why the judge model matters</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          The judge is a single model chosen by the deployment, not per rubric. A smaller or local
          judge is cheaper and noisier, which widens the variance you will see across re-runs. If
          your scores are unstable, the judge model is the first thing to suspect, before the
          criterion wording.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Judges & rubrics"
          desc="Build and refine your scoring criteria."
          onClick={() => go("judges-rubrics")}
        />
        <NavCard
          title="Regression testing"
          desc="Put a calibrated rubric to work."
          onClick={() => go("regression")}
        />
      </div>
    </div>
  )
}

function Regression({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Evaluation" title="Regression testing">
        A regression run compares a new prompt version against a pinned baseline over the same
        dataset, with the same rubric and the same model, and tells you both whether the score
        dropped and exactly which rows caused it.
      </PageHeader>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">1. Pin a baseline</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          A baseline is a prompt version, a dataset, and a rubric pinned together, along with the
          score that combination achieved. Set it from the prompt&apos;s regression page after a run
          you are happy with. Pinning a new baseline replaces the old one for that prompt.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">2. Run a new version against it</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          A regression run re-runs the baseline&apos;s dataset with the new version, holding the
          model and sampling settings from the baseline run so the only thing that changed is the
          prompt. It reports the score delta and a regressed verdict.
        </p>
        <div className="bg-[#121815] border border-[#243029] rounded-[10px] overflow-hidden">
          {[
            ["Threshold range", "0.01 to 0.5"],
            ["Default threshold", "0.05"],
            ["Regressed when", "score delta < negative threshold"],
            ["A drop of exactly the threshold", "not a regression"],
          ].map(([what, value]) => (
            <div
              key={what}
              className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 border-b border-[#1B231F] last:border-b-0 text-[14.5px]"
            >
              <span className="text-[#9FAFA4]">{what}</span>
              <span className={`${mono.className} text-[#7FD6AE] text-right`}>{value}</span>
            </div>
          ))}
        </div>
        <Callout>
          A row counts as regressed if it flipped from passing to failing, or if its own score
          dropped by more than the threshold. That row list is stored with the run, so you can open
          exactly the rows that got worse instead of rereading all 500.
        </Callout>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">3. Watch it over time</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Every regression run is kept, and the prompt&apos;s regression page charts score against
          time so a slow drift across several versions is visible even when no single run tripped
          the threshold.
        </p>
      </div>

      <NotBuilt>
        There is no CI integration. Ultros has no command-line tool and no API token, so a build
        pipeline cannot run a regression check or fail a build on the result. Regression runs are
        launched from the app by a signed-in user. See{" "}
        <button onClick={() => go("roadmap")} className="text-[#7FD6AE] underline underline-offset-2">
          Roadmap
        </button>
        .
      </NotBuilt>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Calibration"
          desc="Make sure the rubric can detect a drop."
          onClick={() => go("calibration")}
        />
        <NavCard
          title="Core concepts"
          desc="Baselines and experiments explained."
          onClick={() => go("core-concepts")}
        />
      </div>
    </div>
  )
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  return `${Math.round(tokens / 1000)}K`
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  openrouter: "OpenRouter",
  ollama: "Ollama (local)",
}

function Models({ go }: { go: (s: Section) => void }) {
  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Reference" title="Models & pricing">
        The full catalog Ultros knows how to price and call. This table is rendered from the same
        constant the run path and the cost calculation read, so it cannot drift from what the app
        actually charges you.
      </PageHeader>

      <Callout>
        Your model picker shows a subset of this list: only the models whose provider is configured
        on the deployment you are using. Prices are the provider&apos;s published rates per million
        tokens, verified 2026-09-04.
      </Callout>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Catalog</h2>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-[0.08em] uppercase text-[#7E8C82]">
                <th className="py-3 pr-4 font-semibold">Model</th>
                <th className="py-3 pr-4 font-semibold">Context</th>
                <th className="py-3 pr-4 font-semibold text-right">In $/M</th>
                <th className="py-3 pr-4 font-semibold text-right">Out $/M</th>
                <th className="py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_CATALOG.map((m) => (
                <tr key={m.id} className="border-t border-[#1B231F] align-top">
                  <td className="py-3 pr-4">
                    <span className="block text-[#ECF1ED] font-medium">{m.displayName}</span>
                    <span className={`${mono.className} block text-[12px] text-[#7E8C82]`}>{m.id}</span>
                    <span className="block text-[12px] text-[#7E8C82]">
                      {PROVIDER_LABELS[m.provider] ?? m.provider}
                    </span>
                  </td>
                  <td className={`${mono.className} py-3 pr-4 text-[#9FAFA4] whitespace-nowrap`}>
                    {formatContext(m.contextWindow)}
                  </td>
                  <td className={`${mono.className} py-3 pr-4 text-[#9FAFA4] text-right whitespace-nowrap`}>
                    {m.inputPerMillion.toFixed(2)}
                  </td>
                  <td className={`${mono.className} py-3 pr-4 text-[#9FAFA4] text-right whitespace-nowrap`}>
                    {m.outputPerMillion.toFixed(2)}
                  </td>
                  <td className="py-3 text-[13px] text-[#7E8C82]">
                    {[
                      m.supportsSampling ? null : "no temperature",
                      m.thinksByDefault ? "thinks by default" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "standard"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Models without a temperature</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Anthropic removed the sampling parameters from Claude Opus 4.7 and the Claude 5 family.
          Sending a temperature to one of those models is rejected outright, so Ultros omits it from
          the request and greys out the control rather than offering a setting that would have no
          effect.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Models that think</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Some models reason before answering, and those reasoning tokens are charged against the
          same output ceiling as the answer. Left alone, a 1024 token limit on a hard question is
          spent thinking and the answer stops mid-sentence. Ultros adds a fixed allowance of 4096
          tokens on top of the limit you set for these models, so you get the answer length you
          asked for. It is an allowance, not a guarantee: a long enough chain of reasoning can still
          reach the ceiling, and the run will show a{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>max_tokens</span> finish reason when
          it does.
        </p>
        <Callout>
          Reasoning tokens are billed as output tokens, so a thinking model costs more per run than
          its output length suggests. The cost recorded against the run is the real one.
        </Callout>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="REST API"
          desc="The endpoints behind every page."
          onClick={() => go("rest-api")}
        />
        <NavCard title="Roadmap" desc="What is described but not built." onClick={() => go("roadmap")} />
      </div>
    </div>
  )
}

function RestAPI({ go }: { go: (s: Section) => void }) {
  const endpoints = [
    { method: "GET", path: "/api/models", desc: "Models this deployment can reach." },
    { method: "GET", path: "/api/prompts", desc: "List your prompts." },
    { method: "POST", path: "/api/prompts", desc: "Create a prompt. Body: { title, description, tags }." },
    { method: "GET", path: "/api/prompts/:id", desc: "One prompt with its versions." },
    { method: "PATCH", path: "/api/prompts/:id", desc: "Update prompt metadata." },
    { method: "DELETE", path: "/api/prompts/:id", desc: "Soft delete. Runs and evals survive for usage accounting." },
    { method: "GET", path: "/api/prompts/:id/versions", desc: "List versions of a prompt." },
    { method: "POST", path: "/api/prompts/:id/versions", desc: "Save a version. Body: { systemPrompt, userPrompt, variables, label }." },
    { method: "POST", path: "/api/run", desc: "Run a version. Streams plain text back as it generates." },
    { method: "POST", path: "/api/compare", desc: "Run one version against up to 3 models at once." },
    { method: "GET", path: "/api/prompts/:id/runs", desc: "Run history for a prompt." },
    { method: "GET", path: "/api/datasets", desc: "List your datasets." },
    { method: "POST", path: "/api/datasets", desc: "Create a dataset. JSON body with exactly one of csvText or rows." },
    { method: "GET", path: "/api/datasets/:id", desc: "Dataset metadata and rows." },
    { method: "DELETE", path: "/api/datasets/:id", desc: "Delete a dataset. Blocked while runs reference it." },
    { method: "POST", path: "/api/datasets/:id/run-estimate", desc: "Cost estimate for a batch run, before you commit to it." },
    { method: "POST", path: "/api/datasets/:id/run", desc: "Launch a batch run. Requires confirm: true." },
    { method: "GET", path: "/api/dataset-runs/:id", desc: "Batch run status and aggregates." },
    { method: "GET", path: "/api/dataset-runs/:id/rows", desc: "Per-row results." },
    { method: "GET", path: "/api/dataset-runs/:id/export", desc: "Per-row results as CSV." },
    { method: "GET", path: "/api/datasets/:id/runs", desc: "Batch runs for one dataset." },
    { method: "GET", path: "/api/rubrics", desc: "List your rubrics." },
    { method: "POST", path: "/api/rubrics", desc: "Create a rubric. Body: { name, criteria, passThreshold }." },
    { method: "GET", path: "/api/rubrics/:id", desc: "One rubric with its criteria." },
    { method: "PATCH", path: "/api/rubrics/:id", desc: "Update a rubric." },
    { method: "DELETE", path: "/api/rubrics/:id", desc: "Delete a rubric." },
    { method: "POST", path: "/api/runs/:runId/eval", desc: "Score one run against a rubric. AI judge criteria are queued." },
    { method: "GET", path: "/api/evals/:id", desc: "One evaluation with its per-criterion scores." },
    { method: "GET", path: "/api/prompts/:id/evals", desc: "Eval history for a prompt." },
    { method: "GET", path: "/api/prompts/:id/leaderboard", desc: "Scores by version and model." },
    { method: "POST", path: "/api/experiments", desc: "Create and launch an experiment. Requires confirm: true." },
    { method: "GET", path: "/api/experiments/:id", desc: "Experiment status and aggregates." },
    { method: "GET", path: "/api/experiments/:id/results", desc: "Per-variant and per-model breakdown." },
    { method: "GET", path: "/api/experiments/:id/rows", desc: "Per-row drill-down for one cell." },
    { method: "POST", path: "/api/prompts/:id/baseline", desc: "Pin a baseline. Body: { promptVersionId, datasetId, rubricId }." },
    { method: "POST", path: "/api/prompts/:id/regression", desc: "Run against the pinned baseline." },
    { method: "GET", path: "/api/prompts/:id/regression/history", desc: "Score over time for all regression runs." },
    { method: "GET", path: "/api/usage", desc: "Your usage and cost totals." },
    { method: "GET", path: "/api/usage/export", desc: "Usage as CSV." },
    { method: "GET", path: "/api/settings", desc: "Monthly budget and month-to-date spend." },
    { method: "PATCH", path: "/api/settings", desc: "Set or clear the monthly budget." },
    { method: "POST", path: "/api/share", desc: "Create a read-only public link." },
    { method: "GET", path: "/api/share/:token", desc: "Public view of a shared resource. No authentication." },
  ]

  const methodColor: Record<string, string> = {
    GET: "text-[#7FD6AE] bg-[#4FB286]/10 border-[#4FB286]/25",
    POST: "text-[#9C7DD4] bg-[#9C7DD4]/10 border-[#9C7DD4]/25",
    PATCH: "text-[#E4BC7A] bg-[#D9A24E]/10 border-[#D9A24E]/25",
    DELETE: "text-[#E0938A] bg-[#D26A5D]/10 border-[#D26A5D]/25",
  }

  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Reference" title="REST API">
        These are the routes the app itself calls. They are documented because the app is open
        source and you may want to read or extend them, not because they are a published integration
        surface.
      </PageHeader>

      <NotBuilt>
        There are no API tokens. Every route below except the public share view is authenticated by
        a Clerk session cookie, which means it is reachable from a signed-in browser and from your
        own local development server, but not from a script or a CI job holding a bearer token.
        Issuing API keys is on the{" "}
        <button onClick={() => go("roadmap")} className="text-[#7FD6AE] underline underline-offset-2">
          Roadmap
        </button>
        .
      </NotBuilt>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Response shape</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          Every JSON response uses one envelope. Errors carry a stable machine-readable code
          alongside a message that is always safe to show a user, so a client can branch on the code
          and never has to match on prose.
        </p>
        <CodeBlock>
          <div className="text-[#7E8C82]"># success</div>
          <div>
            {"{ "}
            <span className="text-[#7FD6AE]">&quot;data&quot;</span>: {"{ … }"},{" "}
            <span className="text-[#7FD6AE]">&quot;error&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">null</span>
            {" }"}
          </div>
          <div>&nbsp;</div>
          <div className="text-[#7E8C82]"># failure</div>
          <div>
            {"{ "}
            <span className="text-[#7FD6AE]">&quot;data&quot;</span>:{" "}
            <span className="text-[#9C7DD4]">null</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;error&quot;</span>: {"{ "}
            <span className="text-[#7FD6AE]">&quot;code&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;VALIDATION_ERROR&quot;</span>,{" "}
            <span className="text-[#7FD6AE]">&quot;message&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;…&quot;</span>
            {" } }"}
          </div>
        </CodeBlock>
        <p className="text-[14.5px] leading-[1.6] text-[#7E8C82]">
          Codes: UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND (404), VALIDATION_ERROR (400),
          INVALID_JSON (400), RATE_LIMITED (429), CONFLICT (409), INTERNAL (500),
          SERVICE_UNAVAILABLE (503).
        </p>
        <Callout>
          <span className={`${mono.className} text-[#7FD6AE]`}>POST /api/run</span> is the one
          exception. It streams the model&apos;s output back as plain text rather than returning the
          envelope, because the response is written as it generates. It is not server-sent events.
        </Callout>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Creating a dataset</h2>
        <p className="text-base leading-[1.65] text-[#9FAFA4]">
          The upload is a JSON body, not a multipart form. Send exactly one of{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>csvText</span> or{" "}
          <span className={`${mono.className} text-[#7FD6AE]`}>rows</span>; sending both, or neither,
          is a validation error.
        </p>
        <CodeBlock>
          <div>{"{"}</div>
          <div className="pl-4">
            <span className="text-[#7FD6AE]">&quot;name&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;support tickets, sample&quot;</span>,
          </div>
          <div className="pl-4">
            <span className="text-[#7FD6AE]">&quot;description&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">&quot;20 rows, hand labelled&quot;</span>,
          </div>
          <div className="pl-4">
            <span className="text-[#7FD6AE]">&quot;csvText&quot;</span>:{" "}
            <span className="text-[#7FD6AE]">
              &quot;input,expectedOutput\nSummarise…,Billing…&quot;
            </span>
          </div>
          <div>{"}"}</div>
        </CodeBlock>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-[22px] font-semibold tracking-tight">Endpoints</h2>
        <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
          {endpoints.map((e) => (
            <div
              key={e.method + e.path}
              className="py-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3"
            >
              <div className="flex items-baseline gap-3 shrink-0">
                <span
                  className={`${mono.className} text-[12px] font-semibold border rounded px-1.5 py-0.5 ${methodColor[e.method] ?? ""}`}
                >
                  {e.method}
                </span>
                <span className={`${mono.className} text-[13.5px] text-[#ECF1ED]`}>{e.path}</span>
              </div>
              <span className="text-[13.5px] text-[#7E8C82]">{e.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[14.5px] leading-[1.6] text-[#7E8C82]">
        Not listed: the Clerk webhook and the queue worker routes under{" "}
        <span className={`${mono.className}`}>/api/jobs</span>. Those are called by Clerk and by the
        job queue, authenticated by signature rather than by a session, and they are not part of any
        user-facing flow.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard
          title="Models & pricing"
          desc="What the run endpoints can call."
          onClick={() => go("models")}
        />
        <NavCard title="Roadmap" desc="What is described but not built." onClick={() => go("roadmap")} />
      </div>
    </div>
  )
}

function Roadmap({ go }: { go: (s: Section) => void }) {
  const notBuilt = [
    {
      title: "Python SDK",
      desc: "There is no ultros package on PyPI and no client library in any language. Earlier versions of this page documented one, including an async namespace and a set of push and evaluate calls. None of it existed. The page has been corrected.",
    },
    {
      title: "Command-line tool",
      desc: "There is no ultros command. Authentication, key management, pushing prompts and datasets, launching evaluations, and regression checks are all browser operations today.",
    },
    {
      title: "API tokens",
      desc: "Routes are authenticated by a Clerk session cookie. There is no bearer token to issue, rotate, or revoke, so nothing outside a signed-in browser can call the API on your behalf.",
    },
    {
      title: "CI regression gates",
      desc: "Gating a build on a regression run needs the two items above. Until then a regression run is something you launch and read in the app.",
    },
    {
      title: "Per-account provider keys",
      desc: "Provider keys are configured once for the whole deployment, from the environment. You cannot add your own key in Settings, and billing for model calls is not split per account. Settings covers your monthly budget, usage export, and share links.",
    },
    {
      title: "Calibration reporting",
      desc: "Judge calibration is a method described under Calibration, carried out with runs and exports. There is no correlation or variance report generated for you.",
    },
  ]

  return (
    <div className="flex flex-col gap-9">
      <PageHeader eyebrow="Reference" title="Roadmap">
        Everything on this page is described somewhere in the product story and does not exist in
        the code. It is listed here so no page has to imply otherwise.
      </PageHeader>

      <div className="flex flex-col gap-0 divide-y divide-[#1B231F]">
        {notBuilt.map((item) => (
          <div key={item.title} className="py-5 flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-base font-semibold text-[#ECF1ED]">{item.title}</span>
              <span
                className={`${mono.className} text-[11px] tracking-[0.08em] uppercase text-[#E4BC7A] bg-[#D9A24E]/10 border border-[#D9A24E]/30 rounded px-1.5 py-0.5`}
              >
                Not built
              </span>
            </div>
            <p className="m-0 text-[14.5px] leading-[1.6] text-[#9FAFA4]">{item.desc}</p>
          </div>
        ))}
      </div>

      <Callout>
        What is built is everything else in these docs: the prompt workspace, versioning, multi-model
        runs and comparison, rubrics with AI judge and deterministic criteria, dataset batch runs,
        experiments, regression testing, usage and budgets, and read-only share links.
      </Callout>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-2">
        <NavCard title="Overview" desc="What you can do today." onClick={() => go("overview")} />
        <NavCard
          title="REST API"
          desc="The routes the app calls."
          onClick={() => go("rest-api")}
        />
      </div>
    </div>
  )
}

const contentMap: Record<Section, (props: { go: (s: Section) => void }) => React.ReactElement> = {
  overview: Overview,
  quickstart: Quickstart,
  "core-concepts": CoreConcepts,
  datasets: Datasets,
  "judges-rubrics": JudgesRubrics,
  calibration: Calibration,
  regression: Regression,
  models: Models,
  "rest-api": RestAPI,
  roadmap: Roadmap,
}

export default function DocsPage() {
  const [active, setActive] = useState<Section>("overview")
  const Content = contentMap[active]

  return (
    <div className={`${sans.className} min-h-screen bg-[#0B0F0D] text-[#ECF1ED] selection:bg-[#4FB286]/35`}>
      {/* Nav */}
      <nav className="max-w-[1120px] mx-auto px-5 sm:px-8 py-5 sm:py-7 flex flex-wrap items-center justify-between gap-y-4 border-b border-[#1B231F]">
        <Link href="/" className="flex items-center gap-2.5 text-[#ECF1ED] no-underline">
          <UltrosLogo />
          <span className={`${serif.className} text-[22px] font-semibold tracking-tight`}>Ultros</span>
          <span className="text-[14px] font-medium text-[#7E8C82] border-l border-[#243029] pl-2.5 ml-0.5">
            Docs
          </span>
        </Link>
        <div className="flex items-center gap-5 sm:gap-8">
          <Link
            href="/#product"
            className="text-[15px] font-medium text-[#9FAFA4] hover:text-[#ECF1ED] transition-colors whitespace-nowrap"
          >
            Product
          </Link>
          <Link href="/docs" className="text-[15px] font-semibold text-[#ECF1ED] whitespace-nowrap">
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
      <div className="max-w-[1120px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-8 lg:gap-16 items-start">
        {/* Sidebar */}
        <nav
          aria-label="Documentation sections"
          className="lg:sticky lg:top-0 pt-8 lg:py-12 flex flex-col gap-6 lg:gap-8"
        >
          {sidebarGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2.5">
              <span className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#7E8C82]">
                {group.label}
              </span>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  aria-current={active === item.id ? "page" : undefined}
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
        </nav>

        {/* Content */}
        <main className="py-8 lg:py-12 pb-[80px] lg:pb-[110px] max-w-[720px] min-w-0">
          <Content go={setActive} />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1B231F]">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-8 py-9 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <UltrosLogo size={20} />
            <span className={`${serif.className} text-lg font-semibold`}>Ultros</span>
          </div>
          <div className="flex items-center gap-7">
            <Link href="/docs" className="text-sm text-[#7E8C82] hover:text-[#9FAFA4] transition-colors">
              Docs
            </Link>
            <span className="text-sm text-[#7E8C82]">
              An AI evaluation platform. Every run scored, every regression caught.
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
