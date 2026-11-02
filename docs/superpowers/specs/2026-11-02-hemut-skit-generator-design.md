# Hemut Skit Generator — Design

Date: 2026-11-02
Status: Approved in brainstorming, pending written-spec review

## Purpose

An internal web page where anyone at Hemut (a trucking TMS company) fills in a few optional fields and gets a filmable short-form skit script in the style of Cluely's viral skits, built around what is trending on TikTok and Instagram right now.

- **Output:** text only — a script. No video, audio, scheduling or posting features.
- **Volume:** 1–2 skits a month, 1–6 people on camera.
- **Users:** anyone at Hemut, no comedy-writing experience assumed.
- **Content mix:** some skits tie into Hemut and freight; some are pure viral attempts unrelated to Hemut.
- **Success:** someone with no writing experience gets a script good enough to film in about 15 minutes, and it rides a trend that is current this week.

## Non-goals

Database, user accounts, password, saved history, analytics, preset rewrite buttons, per-platform variants, prompt caching, video ingestion.

## Architecture

One Next.js (App Router, TypeScript) app deployed on Vercel. One screen.

| Unit | Path | Responsibility |
|---|---|---|
| Page | `app/page.tsx` | Form, streamed script output, rewrite box, Regenerate and Copy buttons. Holds the conversation in React state. |
| Generate endpoint | `app/api/generate/route.ts` | Validates input, builds the request, calls Claude, streams text back. Stateless. |
| Prompt builder | `lib/prompt.ts` | Pure functions: form input + content files → system prompt and user message. No I/O besides reading content files passed in. |
| Input validation | `lib/validate.ts` | Pure function: raw request body → validated input or error message. |
| Content loader | `lib/content.ts` | Reads `content/formats/*.md`, `content/references.md`, `content/hemut.md` at request time. |
| Content | `content/` | Plain markdown edited by Hemut staff through the repo. |

The UI is built with the installed `design-taste-frontend` skill (`.agents/skills/design-taste-frontend`), using its app-screen rules.

### Content files

- `content/formats/<slug>.md` — one per format. Frontmatter `name:` (dropdown label) plus body: structure, typical beats, one short example. Starter set:
  1. `undercover` — Cluely-style fake-cheating / undercover premise played completely straight
  2. `pov` — "POV: you're the dispatcher when…"
  3. `tell-me-without-telling-me` — "Tell me you're in freight without telling me"
  4. `corporate-satire` — meeting / office absurdity played deadpan
  5. `man-on-the-street` — staged street interview
  6. `day-in-the-life` — exaggerated day-in-the-life
- `content/references.md` — running list of Cluely skits that worked: link + 2–4 line description of what happens and why it works. Starter version contains the section structure and instructions for adding entries; Hemut staff fill in real entries.
- `content/hemut.md` — what Hemut does, freight pain points (detention, check calls, rate confirmations, double brokering, freight market slumps), recurring characters (burned-out dispatcher, old-school broker who still faxes, owner-operator, shipper from hell). Starter version is drafted during implementation with clearly labelled sections for Hemut staff to correct.

## Form inputs

All optional except cast size.

| Field | Control | Default / blank behaviour | Server limit |
|---|---|---|---|
| Topic / premise | text | Claude picks from current trends | 500 chars |
| Format | dropdown from `content/formats/` + "Pick for me" | "Pick for me" | must be a known slug or `auto` |
| Setting | text | Claude picks an easy-to-film location | 500 chars |
| Cast size | number 1–6 | required | integer 1–6 |
| Cast names / roles | up to 6 optional rows, one per cast slot | Claude invents characters | 100 chars each; rows ≤ cast size |
| Hemut tie-in | Off / Light / Central | Off | one of the three |
| Length | 15s / 30s / 60s | 30s | one of the three |
| Reference skit | textarea (link + description or transcript) | only `references.md` used | 10,000 chars |
| Extra notes | text | — | 500 chars |

Rewrites send the prior conversation plus a new instruction (500 chars). Conversation history is capped at 10 turns; longer requests are rejected with a message asking the user to start fresh.

## Script output

Markdown, in this order:

1. **Title**
2. **Trend** — what it is, why it fits, source link from search
3. **Hooks** — 3 alternative openings for the first 2 seconds
4. **Cast** — name, role, one-line personality per person
5. **Script** — numbered beats, each with dialogue, *[stage directions]* and **ON-SCREEN TEXT**
6. **Setting & props** — 1–2 lines
7. **Caption + hashtags**

Under the output: rewrite box (free text), Regenerate (same inputs, fresh conversation), Copy (copies markdown).

## Claude request

- SDK: `@anthropic-ai/sdk`, streaming.
- Model: `claude-sonnet-5-5`, `output_config: { effort: "high" }` sent explicitly.
- Thinking: adaptive (the model default); not shown to users.
- Tools: `{ type: "web_search_20260209", name: "web_search", max_uses: 5 }`.
- Refusal fallback: `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- `max_tokens`: 16000 (a script is short; this leaves room for search reasoning).
- API key in Vercel env var `ANTHROPIC_API_KEY`; never sent to the browser.

### System prompt (fixed)

- Role: writer of Cluely-style short-form skits — deadpan, confident absurdity, a little provocative.
- Trend procedure: search for what is trending on TikTok and Instagram this week (formats, sounds, memes); if a topic was given, pick the trend that fits it best, otherwise the one with the most viral potential; cite the source in the Trend section.
- The output format above.
- Rules: exactly N cast members; filmable on a phone in one location with no effects; fits the chosen length; no real competitor names; no defamation; no gags about unsafe driving or hours-of-service violations.
- Hemut tie-in meaning: Off = do not mention Hemut or trucking unless the topic asks for it; Light = a nod or closing line; Central = the premise is built on a Hemut/freight pain point.
- Appended content: all formats, `references.md`, `hemut.md`.

### User message (per request)

The filled form fields in a labelled list, the pasted reference (if any), and for rewrites the instruction appended as a new user turn after the prior assistant script.

## Data flow

1. Page POSTs `{ inputs, history }` to `/api/generate`.
2. Endpoint validates (`lib/validate.ts`); on failure returns 400 with a message.
3. Endpoint loads content, builds system + messages (`lib/prompt.ts`), calls `client.messages.stream(...)`.
4. Endpoint streams newline-delimited JSON events to the page: `{"type":"text","text":"..."}` for script deltas, `{"type":"status","text":"Searching trends…"}` when a `server_tool_use` (web search) block starts, `{"type":"error","text":"..."}` on failure, and `{"type":"done","messages":[...]}` at the end, carrying the assistant message(s) unchanged so the page can append them to its history for rewrites. Rewrite requests send only the messages after the first user message; the server rebuilds that first message from `inputs`.
5. On `stop_reason: "pause_turn"`, endpoint re-sends with the assistant content appended and continues streaming; at most 3 continuations.
6. Page appends the final assistant text to its history for rewrites.

## Error handling

| Case | Behaviour |
|---|---|
| Invalid input | 400, message shown at the top of the Script panel; inputs kept |
| 429 / 5xx / connection error | SDK retries (default 2); then error event "Couldn't generate, try again"; inputs kept |
| `stop_reason: "refusal"` after fallback | Error event "Claude won't write this one — try toning the premise down" |
| Web search error (in-band result) | Claude continues; Trend section says it couldn't confirm current trends |
| `pause_turn` | Auto-continue, max 3 |
| Stream cut / function timeout | Partial script stays visible with "Cut off — hit Regenerate" |

Route exports `maxDuration` set to the highest value the Vercel plan allows, capped at 300 seconds; the implementation plan verifies the current Hobby-plan limit.

## Cost and access

- No password. The page is reachable by anyone with the URL.
- Setup step: create a dedicated Anthropic workspace for this app with a monthly spend limit (suggested $20) and use that workspace's API key.
- Vercel Hobby plan terms are for non-commercial use; Hemut should confirm whether to use Hobby or Pro.
- Expected spend: Sonnet 5.5 at $2 / $10 per million input / output tokens plus per-search fees; well under $1 per script including a few rewrites.

## Testing

- Vitest unit tests for `lib/validate.ts` and `lib/prompt.ts`:
  - cast size 4 → prompt states exactly 4 people
  - tie-in Off / Light / Central → corresponding instruction present
  - formats from `content/formats/` appear in the system prompt and the format dropdown list
  - oversized fields, cast size 0 or 7, unknown format slug, history > 10 turns → rejected
- No automated tests call the real API.
- Manual smoke test after deploy: one script per tie-in setting, one rewrite, confirm a trend source link appears.
