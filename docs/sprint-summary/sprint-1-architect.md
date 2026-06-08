# Sprint 1 — Architect Output
> Foundation: prompt editor, Claude streaming, versioning, auth

---

## Requirements

1. User can sign up / sign in via Clerk (email + OAuth)
2. Protected routes redirect unauthenticated users to `/sign-in`
3. User can create a named prompt (title, optional description, optional tags)
4. User can write a system prompt and a user prompt in a CodeMirror 6 editor with `{{variable}}` syntax highlighted
5. User can set temperature, max_tokens, top-p before running
6. User can hit "Run" and see Claude's response streamed token-by-token in the UI
7. Each run is saved to the DB with model, tokens, latency, cost, response text
8. Every time a user saves a prompt, a new PromptVersion is created (immutable)
9. User can view version history, diff two versions, and restore a previous version
10. User can view a list of all their prompts
11. User can view the run history for a specific prompt

## DB Changes (Prisma — Sprint 1 only)

```prisma
model User {
  id        String   @id @default(cuid())
  clerkId   String   @unique
  username  String?
  avatarUrl String?
  createdAt DateTime @default(now())
  prompts   Prompt[]
  runs      PromptRun[]
}

model Prompt {
  id          String          @id @default(cuid())
  userId      String
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  description String?
  tags        String[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  versions    PromptVersion[]
  runs        PromptRun[]
}

model PromptVersion {
  id            String    @id @default(cuid())
  promptId      String
  prompt        Prompt    @relation(fields: [promptId], references: [id], onDelete: Cascade)
  versionNumber Int
  label         String?
  systemPrompt  String    @default("")
  userPrompt    String
  variables     Json      @default("{}")
  createdAt     DateTime  @default(now())
  runs          PromptRun[]

  @@unique([promptId, versionNumber])
}

model PromptRun {
  id              String        @id @default(cuid())
  promptVersionId String
  promptVersion   PromptVersion @relation(fields: [promptVersionId], references: [id])
  promptId        String
  prompt          Prompt        @relation(fields: [promptId], references: [id])
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  model           String
  provider        String
  temperature     Float
  maxTokens       Int
  inputTokens     Int
  outputTokens    Int
  latencyMs       Int
  costUsd         Float
  responseText    String
  finishReason    String?
  createdAt       DateTime      @default(now())
}
```

**Migration:** new database — `prisma migrate dev --name init`

## New Files / Services

```
app/
  (auth)/
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
    layout.tsx
  (dashboard)/
    layout.tsx                         ← Clerk auth guard
    dashboard/page.tsx
    prompts/
      page.tsx                         ← prompt list
      new/page.tsx                     ← create prompt form
      [id]/
        page.tsx                       ← prompt detail (editor + run + history)
        versions/page.tsx              ← version list + diff
  api/
    webhooks/clerk/route.ts
    prompts/
      route.ts                         ← GET list, POST create
      [id]/
        route.ts                       ← GET, PATCH, DELETE
        versions/
          route.ts                     ← GET list, POST save version
          [versionId]/route.ts         ← GET single version
        runs/route.ts                  ← GET run history
    run/route.ts                       ← POST streaming run endpoint
  layout.tsx
  page.tsx                             ← landing / redirect

components/
  editor/
    PromptEditor.tsx                   ← CodeMirror 6 wrapper
    SystemPromptPanel.tsx
    RunControls.tsx                    ← temperature, max_tokens, top-p sliders
    StreamingOutput.tsx                ← token-by-token display
  prompts/
    PromptCard.tsx
    PromptList.tsx
    CreatePromptForm.tsx
  versions/
    VersionList.tsx
    VersionDiff.tsx
  runs/
    RunHistory.tsx
    RunCard.tsx

lib/
  ai/
    index.ts                           ← unified run() function
    providers/claude.ts                ← Anthropic direct via Vercel AI SDK
    pricing.ts                         ← cost constants (verified 2026-06-08)
  prisma.ts
  auth.ts                              ← Clerk currentUser / auth() helpers
```

## Full API Contract

### POST /api/webhooks/clerk
Syncs new Clerk user to DB. Called by Clerk webhook on `user.created`.
```
Headers: svix-id, svix-timestamp, svix-signature (webhook verification)
Body: Clerk webhook payload
Response 200: { data: "ok", error: null }
Response 400: { data: null, error: "Invalid signature" }
```

### GET /api/prompts
Returns all prompts for the authenticated user, newest first.
```
Auth: Clerk session required
Response 200:
{
  data: [
    {
      id: string,
      title: string,
      description: string | null,
      tags: string[],
      createdAt: string,
      updatedAt: string,
      _count: { versions: number, runs: number }
    }
  ],
  error: null
}
```

### POST /api/prompts
Creates a new prompt with an initial version.
```
Auth: Clerk session required
Body: { title: string, description?: string, tags?: string[], systemPrompt?: string, userPrompt: string }
Response 201:
{
  data: {
    id: string,
    title: string,
    versions: [{ id: string, versionNumber: 1 }]
  },
  error: null
}
Response 400: { data: null, error: "title is required" }
```

### GET /api/prompts/:id
Returns prompt with latest version and run count.
```
Auth: Clerk session required; must own prompt
Response 200:
{
  data: {
    id, title, description, tags, createdAt, updatedAt,
    versions: PromptVersion[],
    _count: { runs: number }
  },
  error: null
}
Response 403: { data: null, error: "Forbidden" }
Response 404: { data: null, error: "Not found" }
```

### PATCH /api/prompts/:id
Updates prompt metadata (not version content — that creates a new version).
```
Auth: Clerk session required; must own prompt
Body: { title?: string, description?: string, tags?: string[] }
Response 200: { data: { id, title, description, tags }, error: null }
```

### DELETE /api/prompts/:id
Soft-deletes prompt (cascade to versions + runs via DB).
```
Auth: Clerk session required; must own prompt
Response 200: { data: { id }, error: null }
```

### POST /api/prompts/:id/versions
Saves current editor state as a new immutable version.
```
Auth: Clerk session required; must own prompt
Body: { systemPrompt: string, userPrompt: string, variables?: object, label?: string }
Response 201:
{
  data: { id, versionNumber, label, createdAt },
  error: null
}
```

### GET /api/prompts/:id/versions
Lists all versions for a prompt, newest first.
```
Response 200:
{
  data: [{ id, versionNumber, label, createdAt, systemPrompt, userPrompt, variables }],
  error: null
}
```

### GET /api/prompts/:id/versions/:versionId
Returns a single version.
```
Response 200: { data: PromptVersion, error: null }
```

### POST /api/run  ← STREAMING
Executes a prompt version against Claude and streams the response.
```
Auth: Clerk session required
Body:
{
  promptVersionId: string,
  model: "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-7",
  temperature: number (0–2),
  maxTokens: number (1–4096),
  topP?: number,
  variables?: object   ← values to interpolate into {{variable}} placeholders
}
Response: text/event-stream (Vercel AI SDK data stream protocol)
  — streams response tokens
  — final chunk includes: { inputTokens, outputTokens, latencyMs, costUsd, runId }
Response 400: { data: null, error: "promptVersionId is required" }
Response 403: { data: null, error: "Forbidden" }
```

### GET /api/prompts/:id/runs
Returns run history for a prompt, newest first.
```
Response 200:
{
  data: [
    {
      id, model, provider, temperature, maxTokens,
      inputTokens, outputTokens, latencyMs, costUsd,
      responseText, finishReason, createdAt,
      promptVersion: { versionNumber, label }
    }
  ],
  error: null
}
```

## Edge Cases

- `{{variable}}` in prompt with no value provided → substitute empty string, do not error
- Streaming run aborted mid-stream by client → save partial run with whatever tokens arrived + `finishReason: "stop_client"`
- Clerk webhook delivered twice (idempotency) → upsert on `clerkId`, not insert
- Version number collision (race condition on concurrent saves) → use `@@unique([promptId, versionNumber])` + retry on conflict
- Empty `userPrompt` → reject at API boundary, 400

## Risks

- **Streaming in Next.js API route:** Must use `new Response(stream)` with correct headers, not `res.json()`. Vercel AI SDK's `streamText` + `toDataStreamResponse()` handles this — do not deviate.
- **Clerk middleware config:** App Router requires `clerkMiddleware()` in `middleware.ts` at the root, with a `publicRoutes` matcher. Missing this blocks all routes or protects none.
- **Supabase connection pooling:** Next.js serverless functions need `DATABASE_URL` to use pgbouncer (port 6543) and `DIRECT_URL` for migrations (port 5432). Both env vars required in Prisma schema.
- **Cost calculation:** Haiku pricing may change. Store in `lib/ai/pricing.ts` with a verified-date comment, never hardcode inline.
- **CodeMirror 6 SSR:** CodeMirror is client-only. The editor component must be loaded with `dynamic(() => import(...), { ssr: false })`.

## Success Criteria

- [ ] `npx prisma migrate dev` runs without error against Supabase
- [ ] Sign up / sign in via Clerk works; protected routes redirect unauthenticated users
- [ ] User webhook fires on sign-up and user row appears in DB
- [ ] Can create a prompt → appears in prompt list
- [ ] Can write system prompt + user prompt in CodeMirror editor
- [ ] Click Run → Claude response streams token-by-token in UI
- [ ] Run record saved in DB with correct token counts and cost
- [ ] Save version → versionNumber increments; previous versions visible in history
- [ ] Diff view shows what changed between two versions
- [ ] Restore version → editor loads that version's content
