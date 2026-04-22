# 戯義偽欺着魏

答えのない問いに、答える。意識・感情・身体・DNA をめぐる対話型アプリ。

## Stack

- Next.js 15 (App Router) / React 19 / TypeScript
- Tailwind CSS
- Anthropic Claude API (`@anthropic-ai/sdk`, model: `claude-opus-4-7`)
- Vercel (deploy)

## Development

```bash
npm install
cp .env.example .env.local   # set ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 .

## Deploy to Vercel

1. Push the repository to GitHub (the `claude/build-new-app-LzLDo` branch).
2. Import the repo from the [Vercel dashboard](https://vercel.com/new).
   Framework preset: Next.js (auto-detected).
3. In **Project Settings → Environment Variables**, add:

   | Key                 | Value            |
   | ------------------- | ---------------- |
   | `ANTHROPIC_API_KEY` | your Claude key  |

4. Deploy. The API route `/api/chat` streams from Claude with a
   `maxDuration` of 60s, within Vercel's limits.

No `vercel.json` is needed — zero-config works.

## Architecture

- `app/page.tsx` — client component; renders the turn stack, handles
  choice submission, consumes the streaming ndjson response.
- `app/api/chat/route.ts` — streams Claude responses as
  `application/x-ndjson`, emitting `{type:"reply",text}` chunks while
  the model writes, then one `{type:"done",reply,choices,theme,...}`
  event at the end.
- `lib/prompt.ts` — system prompt + gotcha log formatter; static part
  is cached via `cache_control: ephemeral` to keep per-turn cost low.
- `lib/storage.ts` — localStorage session I/O. Survives reloads; RESET
  button clears it.
- `lib/types.ts` — shared types (`TurnMessage`, `Turn`, `GotchaEntry`,
  `StoredSession`, `Theme`).

### Trimming

Once the raw history exceeds 20 messages, only the last 12 are sent to
Claude. The full gotcha log is always sent, so the user's past
statements remain available as leverage even as the AI's own history
is compacted.
