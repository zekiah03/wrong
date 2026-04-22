# 戯義偽欺着魏

答えのない問いに、答える。意識・感情・身体・DNA をめぐる対話型アプリ。

## Stack

- Next.js 15 (App Router) / React 19 / TypeScript
- Tailwind CSS
- Anthropic Claude API (`@anthropic-ai/sdk`)
- Vercel

## Development

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY を設定
npm run dev
```

## Phases

- [x] Phase 1 — Project scaffold + UI skeleton
- [ ] Phase 2 — Claude API route + first-turn rendering
- [ ] Phase 3 — Choice UI + LocalStorage persistence
- [ ] Phase 4 — Contradiction / gotcha system prompt
- [ ] Phase 5 — Branching + conversation summarization
- [ ] Phase 6 — UI polish + Vercel deployment
