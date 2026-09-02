# Sprint 1: Teaching Summary
> Foundation: prompt editor, Claude streaming, versioning, auth

---

## 1. What Sprint 1 Built

Sprint 1 delivered the entire working foundation of Ultros: a full-stack prompt experimentation platform where an authenticated user can write prompts with `{{variable}}` syntax in a code editor, run them against Claude models and watch the response stream in real time, save immutable version snapshots, browse the full history, diff two versions side-by-side, and restore any previous version with one click. Every run is persisted to PostgreSQL with token counts, latency, and cost. Authentication and multi-tenancy are handled by Clerk, with a webhook that syncs each new sign-up into the database. The sprint establishes every foundational pattern the rest of the app will build on: how auth works, how data is owned per-user, how streaming works, and how the AI layer is wired.

---

## 2. File-by-File Breakdown

### `prisma/schema.prisma`

This file is the single source of truth for the database schema. Prisma reads it to generate both the TypeScript client and the SQL migrations.

Two details are immediately non-standard compared to older Prisma tutorials:

- `provider = "prisma-client"` (not `"prisma-client-js"`), Prisma 7 renamed the generator.
- `output = "../app/generated/prisma"`, prisma 7 no longer installs the generated client into `node_modules`. You tell it where to write the client files, and you import from that exact path. Here the output is `app/generated/prisma`, so every import looks like `import { PrismaClient } from "@/app/generated/prisma/client"`.
- The `datasource` block has no `url` or `directUrl` fields. Those have been removed from the schema in Prisma 7 and moved to `prisma.config.ts`.

The four models capture the core domain:
- `User`, one row per Clerk user, keyed by `clerkId`.
- `Prompt`. A named container for prompt content; belongs to a user.
- `PromptVersion`, an immutable snapshot of a prompt's system + user text at a moment in time, the `@@unique([promptId, versionNumber])` constraint prevents duplicate version numbers for the same prompt even under concurrent saves.
- `PromptRun`. A record of one execution: which version was run, which model, token counts, latency, cost, and the full response text.

The schema deliberately denormalizes `userId` onto `PromptRun` (even though you could join through `Prompt`). This means you can filter a user's runs with a single `WHERE userId = ?` without a join, important for the usage analytics sprints ahead.

### `prisma.config.ts`

In Prisma 7, the CLI (migrate, generate, studio) no longer reads connection URLs from the schema. Instead it reads from this file, which uses `defineConfig` to supply the datasource URL at CLI time.

This file does two things worth understanding:

1. It calls `config({ path: ".env.local" })` before `config({ path: ".env" })`. This matters because Next.js uses `.env.local` for secrets that should not be committed, but Prisma's CLI doesn't know about Next.js conventions, it only looks for `.env` by default. Loading `.env.local` first means local development secrets take precedence.

2, it contains a `parseUrlComponents` function that manually dissects the connection string. This is the Supabase password problem, explained in detail in section 3.

### `lib/prisma.ts`

This is the Prisma client singleton used at **runtime** (in API routes, not by the CLI). It solves two distinct problems:

**The singleton problem.** Next.js development mode uses hot module reloading (HMR), which re-runs module code every time you save a file. If you just wrote `export const prisma = new PrismaClient()` at the module top level, every hot reload would create a new connection pool, you'd exhaust your database's connection limit within minutes. The fix is to stash the client on `globalThis`, which persists across HMR reloads. In production that code path is skipped because `NODE_ENV === "production"` and HMR doesn't run.

**The adapter problem.** Prisma 7's runtime client no longer accepts a connection string directly. Instead it requires a driver adapter, in this case `@prisma/adapter-pg`, which wraps a `pg.Pool`. This is actually an improvement: `pg.Pool` manages a real connection pool with max connections, idle timeouts, and SSL options that you configure explicitly. The password is passed as a plain string to `Pool`, bypassing URL encoding entirely (the Supabase password problem again).

The import path `@/app/generated/prisma/client` is exactly the `output` path from the schema. If you change one, you must change the other.

### `prisma.config.ts` and `lib/prisma.ts`: the shared `parseUrlComponents` function

Both files contain nearly identical URL parsing logic, they both exist for the same reason, Supabase connection strings contain characters that break standard URL parsers, but they serve different callers: the CLI tool vs. the runtime server. The duplication is intentional: `prisma.config.ts` runs at build/migrate time via Node directly, while `lib/prisma.ts` runs inside the Next.js server. They can't share code through a `lib/` import without careful build configuration, so the small function is duplicated.

### `lib/ai/providers/claude.ts`

One line: import and re-export Anthropic's Vercel AI SDK provider, the indirection seems trivial but it matters for architecture. If you ever swap to a different provider or add per-request configuration (custom base URL, API key rotation), you have a single file to change, every other module imports from this file, not directly from `@ai-sdk/anthropic`.

### `lib/ai/pricing.ts`

Stores per-model costs as `inputPerMillion` and `outputPerMillion` dollar amounts, with a `// verified as of` date comment. The comment is not decoration. AI pricing changes frequently, and "when did we last verify this?" is a real operational question. The `calculateCost` function is a simple arithmetic formula: `(tokens / 1_000_000) * pricePerMillion`. Costs are stored as floating-point USD in the database. Integer cents would be more precise for small numbers, but at AI token costs the floats are fine and more readable.

### `lib/ai/index.ts`

Exports two functions:

**`runStream`** wraps Vercel AI SDK's `streamText`. It validates the model name against a known list, then calls `streamText` with the Anthropic provider. The return value is a `StreamTextResult`, an object that you can both `await` for the full text and stream token-by-token via `.toTextStreamResponse()`. Note that the parameter name in the type is `maxOutputTokens`, not `maxTokens`. This is a Vercel AI SDK v6 rename that burned the team (see section 3).

**`interpolateVariables`** replaces `{{variable_name}}` placeholders using a simple regex. The `??` operator returns an empty string if the variable isn't provided, matching the architect's edge case decision that missing variables should silently substitute empty string rather than error, because during development you often run a prompt before you've filled in all variables.

### `proxy.ts`

This is Clerk's Next.js middleware, and its **filename** is the most important thing about it. In Next.js 16, `middleware.ts` is fully deprecated and the file must be named `proxy.ts`. Without this rename, Clerk middleware never executes. The auth guard silently disappears and all protected routes return 404 instead of 401 or redirecting to sign-in, the AGENTS.md file in the repo warns about this exact change.

The middleware uses `createRouteMatcher` to define which routes are public (the landing page, auth pages, the webhook endpoint, and share routes), every other route hits `auth.protect()`, which redirects unauthenticated users to sign-in. The `config.matcher` regex tells Next.js which requests to run the middleware on, it skips static files and Next.js internals.

### `app/api/run/route.ts`

This is the most architecturally interesting route. It handles streaming, async DB writes, and cost calculation in one place.

The sequence is:
1. Authenticate the user via Clerk and look them up in the database.
2. Load the `PromptVersion`, verify ownership.
3. Interpolate `{{variables}}` into the system and user prompts.
4, call `runStream(...)`. This starts the LLM call but does **not** await it. The result is a `StreamTextResult` object.
5. Schedule an async callback via `Promise.resolve(result.usage).then(...)` that will fire after the stream completes, writing the `PromptRun` record to the database.
6. **Immediately** return `result.toTextStreamResponse()` to the client.

Step 5 and 6 are the key insight: the HTTP response starts streaming back to the browser **before** the database write happens. This is correct behavior. You never want a DB write to block or slow down the response the user is watching. By the time the user finishes reading the streamed output and clicks "Run History", the DB write has long since completed.

The `.catch(() => {})` on the promise swallows DB write errors. This is a pragmatic MVP choice. A failed DB write means the run isn't in history, but the user still got their answer. A production system would log these to an observability service.

### `app/api/prompts/route.ts` and `app/api/prompts/[id]/route.ts`

Standard REST handlers. A few patterns to notice:

The ownership check pattern appears in every route: load the Clerk user ID from `auth()`, find the database `User` row by `clerkId`, then check that the resource being accessed has `userId === user.id`. This two-step lookup (Clerk ID → DB ID → resource) is the multi-tenancy boundary. If you ever forgot the final ownership check, one user could read or modify another user's prompts.

The `POST /api/prompts` handler uses `prisma.$transaction` to create the `Prompt` and its initial `PromptVersion` atomically. If the version insert fails for any reason, the prompt doesn't exist either. You never end up with an empty, version-less prompt.

In `[id]/route.ts`, `params` is typed as `Promise<{ id: string }>` and must be awaited. This is a Next.js 15+ change: dynamic route params are now async.

### `app/api/prompts/[id]/versions/route.ts`

The `POST` handler for saving a new version does something subtle: it queries for the latest version number with `findFirst` ordered by `versionNumber desc`, then increments by 1. This works correctly in single-user-at-a-time scenarios, and the `@@unique([promptId, versionNumber])` constraint in the schema acts as a safety net against the race condition where two saves happen simultaneously. The second insert would fail with a unique constraint violation rather than silently creating a duplicate version number.

### `app/(dashboard)/prompts/[id]/page.tsx`

This is the main editor page. The `(dashboard)` in the path is a Next.js route group. The parentheses mean the folder name doesn't appear in the URL. It's used here to share the `layout.tsx` sidebar across all dashboard pages without that path segment showing in the browser.

The page uses `dynamic(() => import(...), { ssr: false })` to load `PromptEditor`. Server-side rendering is disabled for that component because CodeMirror uses browser APIs that don't exist in a Node.js environment. The `loading` fallback is a pulsing gray rectangle at the same size, so the layout doesn't jump when the editor loads.

State is managed with React `useState` for the two editor fields. `useQuery` from TanStack Query fetches the prompt data and handles loading/error states. When the user restores a version, the page uses a `?version=` URL query parameter, which the `useEffect` watches to load the right version content into the editor.

The streaming `handleRun` function reads the response as a `ReadableStream` using the browser's `getReader()` / `TextDecoder` API, the lowest-level streaming primitive. It accumulates chunks into `fullText` and calls `setRunOutput` after each chunk, creating the token-by-token visual effect.

After a run completes, `queryClient.invalidateQueries({ queryKey: ["runs", id] })` tells TanStack Query to refetch the run history. This is how the history tab updates without a page reload.

### `components/editor/PromptEditor.tsx`

A React wrapper around a CodeMirror 6 editor instance. CodeMirror 6 is not a React component, it's a plain DOM library, the wrapper:

1. Creates one `EditorView` instance in a `useEffect` with an empty dependency array (runs once on mount).
2. Uses a `ref` to hold the view so other effects can access it.
3. Uses an `onChangeRef` ref-as-callback pattern to expose the latest `onChange` prop to the CodeMirror `updateListener` without causing the editor to re-initialize when `onChange` changes identity between renders.
4. Has a second `useEffect` that watches `value` and dispatches a `changes` transaction when the value changes externally (version restore). This keeps CodeMirror's internal state in sync with React state.

The `"use client"` directive at the top is required because this component uses `useEffect` and DOM refs. It cannot run on the server.

---

## 3. The Hard Problems

### Prisma 7 Breaking Changes

Prisma 7 is a significant rewrite compared to Prisma 5/6, and most tutorials and AI training data describe the older API. Four things changed that affected this sprint:

**Generator name.** The old `provider = "prisma-client-js"` was renamed to `provider = "prisma-client"`. Using the old name causes Prisma to skip generation entirely with no obvious error.

**Output path.** Prisma 7 no longer writes generated code into `node_modules/@prisma/client`. You must specify an `output` path in the `generator` block, and you import from that exact path. The chosen path `../app/generated/prisma` means the TypeScript client lives inside the app directory, where it's visible to the TypeScript compiler without special configuration.

**Connection URL moved out of schema.** `url` and `directUrl` fields are removed from the `datasource` block. This is actually a better design: the schema file describes structure (what tables and columns exist), not infrastructure (where the database lives). But it means every project needs a `prisma.config.ts`.

**Runtime adapter.** The runtime client no longer accepts a connection string. You must create a driver adapter. For PostgreSQL this means importing `@prisma/adapter-pg` and wrapping a `pg.Pool`. The benefit is full control over the connection pool: SSL mode, max connections, idle timeout, and crucially the ability to pass the password as a plain string rather than URL-encoded.

### The Supabase Password with Special Characters

Supabase generates database passwords that can contain characters like `%`, `/`, `@`, `*`, and `#`. Standard URL parsers use `@` to split the user info from the host, and `%` to begin a percent-encoded escape sequence. A password containing `@` fools the parser into thinking there are two `@` symbols, the first `@` in the password becomes the user/host separator.

For example, a connection string like:
```
postgresql://user:p@ss@word123@db.host.com:5432/postgres
```
is ambiguous, a naive parser sees `p` as the password and `ss@word123@db.host.com` as a hybrid of host and path.

The correct parser finds the **last** `@` in the string and treats everything before it as user info and everything after as host info. That's what `parseUrlComponents` does: `withoutProto.lastIndexOf("@")` rather than `indexOf("@")`.

After parsing, the password is stored in a separate `DB_PASSWORD` environment variable and passed directly to `pg.Pool({ password: process.env.DB_PASSWORD })`. When the password is a plain string to a named parameter, no URL encoding or decoding occurs. The `@`, `%`, and `/` characters are just characters, the problem only exists in URL form.

### Next.js 16: `middleware.ts` → `proxy.ts`

In Next.js 16, the conventional middleware filename changed. The file that was `middleware.ts` in Next.js 13–15 must now be named `proxy.ts`, if you leave it as `middleware.ts`, Next.js ignores it entirely. It doesn't warn you, it doesn't throw an error. Your Clerk middleware simply doesn't run.

The symptom was every protected route returning 404. The explanation is subtle: without the middleware running, Clerk's auth session is never established, and the route handlers call `auth()` and get back `{ userId: null }`, the route responds with 401, but Clerk's client-side code intercepts 401 responses and redirects, ending up at a 404 because the sign-in redirect URL wasn't registered correctly.

The fix was a filename rename. The AGENTS.md file injected by `create-next-app` contained a comment specifically warning that this version's middleware conventions differ from training data. That comment was the first clue.

**What this teaches you:** Major framework versions routinely rename files and conventions. An AGENTS.md or MIGRATION.md in a project is not decoration. It contains information that is more accurate than whatever your tools were trained on.

### Vercel AI SDK v6 API Renames

The Vercel AI SDK went through significant API changes between v4 and v6. Three renames affected this sprint:

**`maxTokens` → `maxOutputTokens` in `streamText` params.** This is the field name you pass when calling `streamText`. The old name silently accepted but was ignored, meaning Claude would run with no token limit. If you pass `maxTokens: 1024` to `streamText` in v6, it's passed as an unknown field and dropped. The field you actually want is `maxOutputTokens`.

**`toDataStreamResponse()` → `toTextStreamResponse()`.** The old method returned a response in Vercel's custom AI data stream protocol format, which the frontend then had to parse with a matching SDK function. The new method returns a plain text stream: raw tokens, no protocol framing. This simplifies the frontend: you read it with `res.body.getReader()` directly and the chunks are just text.

**`usage.promptTokens` / `usage.completionTokens` → `usage.inputTokens` / `usage.outputTokens`.** The property names on the usage object changed to align with Anthropic's own naming convention (which uses "input"/"output" rather than "prompt"/"completion").

There is one subtlety about `result.usage` that isn't obvious from the type signature: it is a `PromiseLike` (it has a `.then` method) but is not a full `Promise` (it does not have `.catch` or `.finally`). This means you cannot write `result.usage.catch(...)`. It will throw at runtime. The workaround is `Promise.resolve(result.usage).then(...).catch(...)`, which wraps the PromiseLike in a real Promise.

### The Streaming + Async DB Write Pattern

When a user clicks Run, the response needs to stream in real time. But when the stream is done, you also need to persist the run to the database. These two operations have a tension: if you wait for the DB write before responding, the user stares at a blank screen while the write completes. If you start streaming immediately but write synchronously in the same async function, you block the response.

The solution in `/api/run/route.ts` is to decouple them in time:

```
result = runStream(...)                          // start LLM call
Promise.resolve(result.usage).then(async () => { // fires AFTER stream ends
  await prisma.promptRun.create(...)             // write to DB
}).catch(() => {})

return result.toTextStreamResponse()             // start streaming NOW
```

The HTTP response starts streaming at line 4. The DB write happens at line 2, but `result.usage` doesn't resolve until the LLM finishes generating, which means the DB write fires only after the last token is sent. This creates a small window where the run is visible in the UI but not yet in the database, but by the time the user switches to the "Run History" tab (which requires a click, a state change, and a fresh query), the write is complete.

This is a form of **fire-and-forget**: you start a side effect, return the response, and trust the side effect will complete. The `.catch(() => {})` is deliberate. If the DB write fails, the user already has their response, and throwing an unhandled rejection error would crash the serverless function for no benefit.

---

## 4. Patterns to Know

### Singleton Pattern: `lib/prisma.ts`

The Prisma client uses the singleton pattern to ensure only one database connection pool exists per process. The implementation uses `globalThis` as the storage location because module-level variables are reset by Hot Module Replacement in Next.js dev mode, but `globalThis` persists.

Pattern: "I need exactly one instance of an expensive resource per process."
Why here: database connection pools are expensive to create; opening hundreds of them causes connection exhaustion at the database layer.

### Adapter Pattern: `lib/ai/providers/claude.ts` and `lib/prisma.ts`

Both the AI provider and the database adapter use the adapter pattern: they wrap a third-party interface and expose a uniform one to the rest of the application. `@prisma/adapter-pg` adapts `pg.Pool` (Node's PostgreSQL driver) to Prisma's internal driver interface. `@ai-sdk/anthropic` adapts Anthropic's API to the Vercel AI SDK's model interface.

Pattern: "I want to use a library but isolate my code from its specific API."
Why here: if Anthropic changes its API, or if we add a second provider (OpenAI, Gemini), we change the adapter file, not every call site.

### Repository Pattern: API routes

Each API route file acts as a thin repository: it knows how to query the database for a specific type of resource, enforces ownership rules, and returns plain data. The routes themselves don't contain any business logic beyond "does this user own this resource?", they're data access layers with HTTP wrappers.

Pattern: "Separate data access logic from business logic."
Why here: it keeps routes readable and makes the ownership check visible in a consistent location across all routes.

### Optimistic UI + Query Invalidation: `page.tsx`

After a run completes, the page calls `queryClient.invalidateQueries({ queryKey: ["runs", id] })`. This tells TanStack Query to mark the cached run data as stale and refetch it. The user doesn't know a refetch happened, the tab just updates.

Pattern: "Trigger background data sync after a mutation."
Why here: React state can't hold data that came from the server; you need a data-fetching layer that knows how to revalidate.

### Immutable Versioning

`PromptVersion` records are never updated, only created. When a user edits a prompt and saves, a new `PromptVersion` is created with an incremented `versionNumber`. The old version still exists in the database and can be restored. This is the core of any version control system.

Pattern: "Append-only log for mutation history."
Why here: it's the only way to have a reliable history. If you updated records in-place, previous states would be lost.

---

## 5. Interview Prep

After this sprint, you should be able to explain:

- Why Prisma 7 moves connection URLs out of `schema.prisma` into `prisma.config.ts`, and what problem this separation solves.
- What the `output` field in the Prisma generator does, and why it produces a custom import path instead of importing from `@prisma/client`.
- Why you need a driver adapter (`@prisma/adapter-pg`) in Prisma 7's runtime, and what `pg.Pool` is doing under the hood.
- What the Prisma singleton pattern on `globalThis` is protecting against, and why it only applies in development.
- Why a Supabase password with `@` or `%` breaks URL parsers, and how parsing on the last `@` fixes it.
- What Next.js route groups are (the `(dashboard)` parentheses in the path) and what they do to the URL.
- Why `params` in Next.js 15+ dynamic routes is a `Promise<...>` and must be awaited.
- What `auth.protect()` does in Clerk middleware vs. checking `auth()` inside a route handler, and why you need both.
- How HTTP streaming works in a Next.js API route: why you return a `Response` with a `ReadableStream` rather than using `res.json()`.
- Why the DB write in `/api/run` is decoupled from the response via `Promise.resolve(result.usage).then(...)`.
- What `result.usage` being a `PromiseLike` (not a full `Promise`) means in practice, and why you need `Promise.resolve()` to add `.catch()`.
- Why CodeMirror must be loaded with `{ ssr: false }`, and what would happen if you didn't.
- The difference between the `onChangeRef` ref pattern in `PromptEditor` (stable callback reference) vs. passing `onChange` directly to the CodeMirror listener (would cause re-initialization on every render).
- What `@@unique([promptId, versionNumber])` in Prisma accomplishes and what database-level guarantee it provides.
- Why `PromptRun` denormalizes `userId` even though it could be reached by joining through `Prompt`.

---

## 6. Go Deeper

**Prisma 7**
- [Prisma 7 migration guide](https://www.prisma.io/docs/guides/upgrade-guides/upgrading-versions/upgrading-to-prisma-7), covers all the breaking changes from 5/6 to 7 in one place
- [Prisma driver adapters](https://www.prisma.io/docs/orm/overview/databases/database-drivers), explains why adapters exist and the tradeoffs vs. the old built-in connectors
- [pg.Pool documentation](https://node-postgres.com/apis/pool), understanding `max`, `idleTimeoutMillis`, and connection lifecycle

**Next.js App Router**
- [Next.js Route Groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups). The `(folder)` convention and when to use it
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware), how `proxy.ts`, the matcher, and `config.matcher` interact
- [Next.js Dynamic Route Params in v15+](https://nextjs.org/docs/app/api-reference/file-conventions/route#context-optional), why params became async

**Streaming**
- [Vercel AI SDK `streamText`](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text), the full API surface including `usage`, `text`, and `toTextStreamResponse()`
- [WHATWG Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API), the browser's `ReadableStream`, `getReader()`, and `TextDecoder` that power the client-side streaming loop
- [Server-Sent Events vs, webSockets](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events). SSE is what `toTextStreamResponse()` produces under the hood; understanding it helps debug streaming issues

**CodeMirror 6**
- [CodeMirror 6 System Guide](https://codemirror.net/docs/guide/), the extension system, state, and view architecture; very different from any textarea library
- [CodeMirror 6 with React](https://codemirror.net/examples/react/). The official example of the mount-once-in-useEffect pattern used here

**Auth and Multi-tenancy**
- [Clerk Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs), the full setup including webhooks
- [Clerk Webhook Verification with Svix](https://docs.svix.com/receiving/verifying-payloads/how). How the signature verification in the webhook handler works
- [Row-Level Security in PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), a database-native alternative to application-layer `WHERE userId = ?` checks, worth understanding as a deeper defense

**TanStack Query**
- [TanStack Query `invalidateQueries`](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation), the complete lifecycle of cache invalidation and background refetch
