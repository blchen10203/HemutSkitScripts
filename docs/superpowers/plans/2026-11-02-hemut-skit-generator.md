# Hemut Skit Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-screen Next.js app on Vercel where anyone at Hemut fills in optional fields and gets a streamed, trend-aware, Cluely-style skit script they can rewrite and copy.

**Architecture:** A server component page loads markdown content files and renders a client form. The form POSTs to one stateless route handler, which validates input, builds the prompt, calls Claude Sonnet 5.5 with server-side web search, and streams newline-delimited JSON events back. The browser keeps the conversation for rewrites.

**Tech Stack:** Next.js (App Router, TypeScript), `@anthropic-ai/sdk`, Vitest, plain CSS (no Tailwind), Vercel.

**Spec:** `docs/superpowers/specs/2026-11-02-hemut-skit-generator-design.md`

## Global Constraints

- Model `claude-sonnet-5-5`; `output_config: { effort: "high" }`; `max_tokens: 16000`; thinking left at the model default (adaptive, not displayed).
- Tool `{ type: "web_search_20260209", name: "web_search", max_uses: 5 }`.
- Refusal fallback: `client.beta.messages.stream({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", ... })`. If the installed SDK's types reject `fallbacks: "default"`, add a one-line `// @ts-expect-error` above it with the reason; do not switch to the array form.
- `ANTHROPIC_API_KEY` is read only on the server; nothing imports the SDK from a client component.
- Server limits: topic, setting, notes, rewrite instruction ≤ 500 chars; each cast row ≤ 100 chars; reference ≤ 10,000 chars; cast size integer 1–6; cast rows ≤ cast size; ≤ 10 user (rewrite) messages in history; serialized history ≤ 300,000 chars.
- Defaults: format `auto`, tie-in `off`, length `30s`.
- No database, auth, password, history storage, analytics, markdown renderer or other new dependency beyond `@anthropic-ai/sdk` and `vitest`.
- Content files may have CRLF line endings (Windows checkout); parsers must accept both.
- Commits: end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. This machine has no global git identity; commit with `git -c user.name=bryanchen10203 -c user.email=bryanchen10203@gmail.com commit ...` unless one has been set since.

## Review Focus

1. **NDJSON events split across network chunks** (including multi-byte characters split mid-chunk): the page must still get every event intact. Test in Task 5.
2. **Claude writes a preamble ("Let me search…") before searching:** that text must not end up in the script. The page clears the output on each `status` event. Test in Task 4 (event order) and Task 5 (parser leaves order intact).
3. **Content files with CRLF endings:** format names still parse. Test in Task 2.
4. **The stream ends with no `done` or `error` event** (Vercel timeout, dropped connection): partial text stays and "Cut off — hit Regenerate" shows. Handled in Task 6 by the `sawTerminal` flag; checked in the Task 7 manual smoke test.
5. **A rewrite after a `pause_turn` continuation:** history then holds consecutive assistant messages, which validation must accept. Test in Task 3.

---

### Task 1: Scaffold the app

**Files:**
- Create: Next.js scaffold at repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`)
- Create: `vitest.config.ts`
- Test: `lib/smoke.test.ts` (deleted in Task 2)

**Interfaces:**
- Produces: `npm test` (runs `vitest run`), `npm run build`, path alias `@/*` → repo root.

- [ ] **Step 1: Scaffold in a temp folder and move it in.** `create-next-app` refuses a folder that already has files, so:

```bash
npx create-next-app@latest scaffold-tmp --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes
```

Move everything in `scaffold-tmp/` (including dotfiles, excluding `scaffold-tmp/.git` if one exists) into the repo root, then delete `scaffold-tmp/`.

- [ ] **Step 2: Install dependencies.** `npm install @anthropic-ai/sdk` and `npm install -D vitest`. Add `"test": "vitest run"` to `package.json` scripts. Create `vitest.config.ts` with `resolve.alias` mapping `@` to the repo root and `test.environment: "node"`.

- [ ] **Step 3: Write `lib/smoke.test.ts`** containing `expect(1 + 1).toBe(2)`.

- [ ] **Step 4: Verify.** Run `npm test`; expected: 1 test passes. Run `npm run build`; expected: build succeeds.

- [ ] **Step 5: Commit** the scaffold plus the already-installed `.agents/`, `.claude/` and `skills-lock.json`. Confirm `.gitignore` covers `node_modules`, `.next` and `.env*`.

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: Content files and loader

**Files:**
- Create: `content/formats/{undercover,pov,tell-me-without-telling-me,corporate-satire,man-on-the-street,day-in-the-life}.md`
- Create: `content/references.md`, `content/hemut.md`
- Create: `lib/content.ts`
- Test: `lib/content.test.ts`; delete `lib/smoke.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Format { slug: string; name: string; body: string }
  export interface Content { formats: Format[]; references: string; hemut: string }
  export function parseFormat(slug: string, raw: string): Format
  export async function loadContent(dir?: string): Promise<Content> // default path.join(process.cwd(), "content")
  ```

- [ ] **Step 1: Write the content files.**
  - Each format file starts with a frontmatter block containing `name: <dropdown label>`, then about 10–20 lines covering structure, typical beats and one short example. Use the descriptions from the spec's starter set.
  - `references.md`: a heading, a short note on how to add an entry (link + 2–4 lines on what happens and why it works), and an empty "Entries" section.
  - `hemut.md`: labelled sections "What Hemut does", "Freight pain points" (detention, check calls, rate confirmations, double brokering, freight market slumps) and "Recurring characters" (burned-out dispatcher, old-school broker who still faxes, owner-operator, shipper from hell). Open the file with a line telling Hemut staff to correct it.

- [ ] **Step 2: Write failing tests** in `lib/content.test.ts`:
  - `parseFormat("pov", "---\nname: POV\n---\nBody text")` → `{ slug: "pov", name: "POV", body: "Body text" }`
  - The same input with `\r\n` endings gives the same `name` and `body`.
  - A file with no frontmatter gets `name` equal to the slug and the whole text as `body`.
  - `loadContent()` against the real `content/` folder: 6 formats sorted by slug, each with a non-empty `name`; `references` and `hemut` are non-empty.

- [ ] **Step 3: Run `npm test`.** Expected: FAIL (module not found).

- [ ] **Step 4: Implement `lib/content.ts`.** Use `fs/promises`. Read `formats/*.md` and sort by slug. Normalize `\r\n` to `\n` before matching the frontmatter regex. No YAML dependency.

- [ ] **Step 5: Run `npm test`.** Expected: PASS.

- [ ] **Step 6: Commit** `content/`, `lib/content.ts`, `lib/content.test.ts` and the smoke-test deletion with message `feat: add content files and loader`.

---

### Task 3: Input validation

**Files:**
- Create: `lib/types.ts`, `lib/validate.ts`
- Test: `lib/validate.test.ts`

**Interfaces:**
- Produces (`lib/types.ts`):
  ```ts
  import type Anthropic from "@anthropic-ai/sdk";
  export type TieIn = "off" | "light" | "central";
  export type SkitLength = "15s" | "30s" | "60s";
  export interface SkitInputs {
    topic: string; format: string /* slug or "auto" */; setting: string;
    castSize: number; cast: string[]; tieIn: TieIn; length: SkitLength;
    reference: string; notes: string;
  }
  export type HistoryMessage = Anthropic.Beta.BetaMessageParam;
  export interface GenerateRequest { inputs: SkitInputs; history: HistoryMessage[] }
  export type StreamEvent =
    | { type: "status"; text: string }
    | { type: "text"; text: string }
    | { type: "error"; text: string }
    | { type: "done"; messages: HistoryMessage[] };
  ```
- Produces (`lib/validate.ts`):
  ```ts
  export function validateRequest(body: unknown, formatSlugs: string[]):
    { ok: true; value: GenerateRequest } | { ok: false; error: string }
  ```
  `history` holds the messages *after* the first user message, which the server rebuilds from `inputs` on every request. When `history` is non-empty, its last item must be a `user` message whose `content` is a string (the rewrite instruction). Every `user` message in history must have string content. Roles other than `user` and `assistant` are rejected. Assistant content is passed through without inspection, limited only by the size cap. Missing optional string fields default to `""`, and missing `format`/`tieIn`/`length` default per Global Constraints.

- [ ] **Step 1: Write failing tests.** Each rejection asserts `ok === false` and a non-empty `error`:
  - A minimal valid body `{ inputs: { castSize: 2 }, history: [] }` is accepted, with defaults `format: "auto"`, `tieIn: "off"`, `length: "30s"` and `cast: []`.
  - Rejected: `castSize` of 0, 7 or 2.5; `cast` with 3 rows when `castSize` is 2; a 501-character `topic`; a 101-character cast row; a 10,001-character `reference`; `format: "nope"` when slugs are `["pov"]`; `tieIn: "max"`; `length: "90s"`.
  - History `[assistant, assistant, user "make it meaner"]` (consecutive assistant messages, as after a `pause_turn`) is accepted.
  - Rejected: history ending in an assistant message; history with 11 user messages; history serialized over 300,000 characters; a user message with array content; `role: "system"`.
  - Rejected: a non-object body, `null`, or a missing `inputs`.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement `validateRequest`** by hand-checking types, with no schema library. Error strings should read well on the page, e.g. "Cast size must be 1–6."

- [ ] **Step 4: Run `npm test`.** Expected: PASS.

- [ ] **Step 5: Commit** with message `feat: validate generate requests`.

---

### Task 4: Prompt builder and generation runner

**Files:**
- Create: `lib/prompt.ts`, `lib/generate.ts`
- Test: `lib/prompt.test.ts`, `lib/generate.test.ts`

**Interfaces:**
- Consumes: `Content`, `Format` (Task 2); `SkitInputs`, `GenerateRequest`, `HistoryMessage`, `StreamEvent` (Task 3).
- Produces:
  ```ts
  // lib/prompt.ts
  export function buildSystemPrompt(content: Content): string
  export function buildUserMessage(inputs: SkitInputs, formats: Format[]): string
  export function buildMessages(req: GenerateRequest, content: Content): HistoryMessage[] // [{role:"user",content:buildUserMessage(...)}, ...req.history]
  // lib/generate.ts
  export const MODEL = "claude-sonnet-5-5";
  export const MAX_CONTINUATIONS = 3;
  export type StreamFn = (params: Record<string, unknown>) =>
    AsyncIterable<{ type: string; [k: string]: any }> & { finalMessage(): Promise<{ stop_reason: string | null; content: unknown[] }> };
  export async function runGeneration(stream: StreamFn, system: string, messages: HistoryMessage[], emit: (e: StreamEvent) => void): Promise<void>
  ```
  The route passes `(p) => client.beta.messages.stream(p as any)` as `stream`. Tests pass a fake.

- [ ] **Step 1: Write failing prompt tests** (`lib/prompt.test.ts`):
  - `buildUserMessage` with `castSize: 4` contains `Cast: exactly 4 people`.
  - The tie-in lines are exactly:
    - `off` → `Hemut tie-in: OFF — do not mention Hemut or trucking unless the topic asks for it.`
    - `light` → `Hemut tie-in: LIGHT — include one nod or closing line about Hemut.`
    - `central` → `Hemut tie-in: CENTRAL — build the premise on a Hemut or freight pain point.`
  - `format: "auto"` → contains `Format: pick the best fit from the format library`. `format: "pov"` → contains `Format: POV` (the name, not the slug).
  - A blank `topic` → contains `Topic: (none — pick from current trends)`. A blank `setting` → contains `Setting: (none — pick an easy-to-film location)`.
  - A non-empty `cast` lists each row. A non-empty `reference` appears under a `Reference skit:` label.
  - `buildSystemPrompt` contains every format's `name` and `body`, the `references` text, the `hemut` text, and the phrases `TikTok`, `Instagram`, `this week`, `no real competitor names`, `hours-of-service` and `couldn't confirm current trends` (the instruction for when search fails). It also contains the seven output section headings in spec order: `Title`, `Trend`, `Hooks`, `Cast`, `Script`, `Setting & props`, `Caption`.
  - `buildMessages` returns the built user message first, followed by `history` unchanged.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement `lib/prompt.ts`.** The system prompt carries everything in the spec's "System prompt (fixed)" list, plus the instruction: *"Write nothing before the script. If you search, search first; your visible answer starts with the Title."*

- [ ] **Step 4: Run `npm test`.** Expected: prompt tests pass.

- [ ] **Step 5: Write failing runner tests** (`lib/generate.test.ts`). Use a fake `StreamFn` that yields scripted events and resolves `finalMessage()` with a given `stop_reason` and `content`.
  - Text deltas (`content_block_delta` / `text_delta`) are emitted as `{type:"text"}` in order. After `end_turn`, the last event is `{type:"done", messages:[{role:"assistant", content}]}`.
  - A `content_block_start` whose `content_block.type` is `"server_tool_use"` emits `{type:"status", text:"Searching trends…"}`, in its correct place among the text events.
  - The params passed to the fake include `model: "claude-sonnet-5-5"`, `max_tokens: 16000`, `output_config: { effort: "high" }`, the web search tool with `max_uses: 5`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` and the given `system`.
  - `pause_turn` followed by `end_turn`: the second call's `messages` ends with the first assistant content, with no extra user message. `done.messages` holds both assistant messages in order.
  - Four `pause_turn`s in a row: the stream is called exactly 4 times (1 + `MAX_CONTINUATIONS`), then `{type:"error", text:"Cut off — hit Regenerate"}` is emitted with no `done`.
  - `stop_reason: "refusal"` → `{type:"error", text:"Claude won't write this one — try toning the premise down"}` and no `done`.
  - The fake throws an error (simulating an API failure) → `{type:"error", text:"Couldn't generate, try again"}`.

- [ ] **Step 6: Run `npm test`.** Expected: FAIL.

- [ ] **Step 7: Implement `runGeneration`.** Loop: call `stream`, forward events, `await finalMessage()`, then branch on `stop_reason`. Wrap the whole loop in one `try/catch` for API errors. Log the caught error with `console.error` so it shows up in Vercel logs.

- [ ] **Step 8: Run `npm test`.** Expected: PASS.

- [ ] **Step 9: Commit** with message `feat: build prompts and run streamed generation`.

---

### Task 5: Generate route and NDJSON parser

**Files:**
- Create: `app/api/generate/route.ts`, `lib/ndjson.ts`
- Test: `lib/ndjson.test.ts`

**Interfaces:**
- Consumes: `loadContent` (Task 2), `validateRequest` (Task 3), `buildSystemPrompt`, `buildMessages`, `runGeneration` (Task 4).
- Produces:
  - `POST /api/generate` accepts a `GenerateRequest` as JSON. It returns `400 { error: string }` for invalid JSON or failed validation. Otherwise it returns `200` with `Content-Type: application/x-ndjson`: one `StreamEvent` as JSON per line.
  - `lib/ndjson.ts`: `export function createEventParser(onEvent: (e: StreamEvent) => void): { push(chunk: Uint8Array): void; end(): void }`.

- [ ] **Step 1: Write failing parser tests** (`lib/ndjson.test.ts`):
  - Two events in one chunk → both delivered, in order.
  - One event split across three chunks → delivered once, intact.
  - A text event containing `—` and `🚚`, with the encoded bytes split in the middle of a character → the text arrives intact.
  - A final line with no trailing newline is delivered on `end()`.
  - Blank lines are ignored.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.

- [ ] **Step 3: Implement `createEventParser`.** Use a `TextDecoder` with `{ stream: true }` and buffer until each `\n`.

- [ ] **Step 4: Run `npm test`.** Expected: PASS.

- [ ] **Step 5: Implement the route.**
  - Exports: `export const runtime = "nodejs"` and `export const maxDuration = 300`.
  - Create the SDK client once at module scope: `new Anthropic()`.
  - Validate with the slugs from `loadContent()`.
  - Return a `ReadableStream` that runs `runGeneration`, writes each event as `JSON.stringify(e) + "\n"`, and closes in `finally`.

- [ ] **Step 6: Verify the 400 path manually.** Run `npm run dev` and send a body with `castSize: 9`:

```bash
curl -s -X POST localhost:3000/api/generate -H "content-type: application/json" -d "{\"inputs\":{\"castSize\":9},\"history\":[]}"
```

Expected: `{"error":"Cast size must be 1–6."}` with status 400. (No API key is needed for this path.)

- [ ] **Step 7: Run `npm run build`.** Expected: success. If Vercel later rejects `maxDuration = 300` at deploy time, set it to the limit the error message states.

- [ ] **Step 8: Commit** with message `feat: add streaming generate endpoint`.

---

### Task 6: The page

**Files:**
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`
- Create: `app/SkitForm.tsx` (client component)

**Interfaces:**
- Consumes: `loadContent` (server side only), `StreamEvent`, `SkitInputs`, `HistoryMessage` (Task 3), `createEventParser` (Task 5), `POST /api/generate`.
- Produces: `app/page.tsx` (async server component) renders `<SkitForm formats={content.formats.map(({ slug, name }) => ({ slug, name }))} />`.

- [ ] **Step 1: Load the `design-taste-frontend` skill** and follow its app-screen run for the look: one screen, the form beside or above the output, readable at phone width.

- [ ] **Step 2: Implement `SkitForm`.**
  - **Fields:** the spec's form table, using its controls and defaults. Cast rows: one optional text input per cast slot (up to `castSize`). Format dropdown: "Pick for me" (`auto`) followed by `formats`.
  - **State:** `inputs`, `history: HistoryMessage[]`, `output: string`, `status: string`, `error: string`, `busy: boolean`.
  - **Generate / Regenerate:** POST `{ inputs, history: [] }`.
  - **Rewrite:** POST `{ inputs, history: [...history, { role: "user", content: instruction }] }`.
  - **On each request:** clear `output`, `error` and `status`. Disable the buttons while `busy`. A non-200 response shows the `error` from its JSON body and keeps the inputs.
  - **Stream events:**
    - `status` → set `status` and **clear `output`** (drops any pre-search preamble)
    - `text` → append to `output` and clear `status`
    - `error` → set `error`
    - `done` → `history = [...sentHistory, ...messages]`
  - **Cut-off detection:** if the stream ends with no `done` or `error` event (track with a `sawTerminal` flag), set `error` to `Cut off — hit Regenerate` and keep the partial output.
  - **Output:** shown as preformatted markdown text (`white-space: pre-wrap`), not rendered.
  - **Copy:** `navigator.clipboard.writeText(output)`, with brief "Copied" feedback.
  - **Labels:** every input has a visible label, and the output region has `aria-live="polite"`.

- [ ] **Step 3: Verify in the browser.** Run `npm run dev`, open `localhost:3000`, and check:
  - The form renders with 6 formats plus "Pick for me".
  - Cast size 9 is either blocked in the UI or shows the server's 400 message.
  - The layout holds at 375px width.
  - Without `ANTHROPIC_API_KEY` set, Generate shows "Couldn't generate, try again".

- [ ] **Step 4: Run `npm test && npm run build`.** Expected: both pass.

- [ ] **Step 5: Commit** with message `feat: add skit generator page`.

---

### Task 7: Setup notes and live smoke test

**Files:**
- Create: `README.md` (replaces the scaffold's README)
- Create: `.env.example` containing `ANTHROPIC_API_KEY=`

- [ ] **Step 1: Write `README.md`.** Cover:
  - **What the tool is.**
  - **Editing content:** `content/formats/*.md` (frontmatter `name:`), `references.md`, `hemut.md`.
  - **Local run:** copy `.env.example` to `.env.local`, then `npm run dev`.
  - **Setup checklist:**
    1. Create a dedicated Anthropic workspace with a monthly spend limit (suggested $20) and use its API key.
    2. Import the repo into Vercel and set `ANTHROPIC_API_KEY` in the project's environment variables.
    3. Hobby plan terms are for non-commercial use; confirm Hobby vs Pro.
  - **Smoke test:** the steps in Step 2 below.

- [ ] **Step 2: Live smoke test** with a real key in `.env.local`. This spends real API credit (cents), so confirm with your human partner first.
  - Generate one script per tie-in setting (Off, Light, Central).
  - Each script has all 7 sections and a source link in Trend.
  - "Searching trends…" appears and then clears.
  - One rewrite changes the script.
  - Copy works.

- [ ] **Step 3: Commit** with message `docs: add setup and smoke-test notes`.
