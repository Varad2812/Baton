# Progress

## Done
- Project skeleton: Next.js 16 (App Router, TS strict, src/), Tailwind v4 wired to Baton tokens, shadcn/ui base (Button) restyled
- Fonts via next/font: Source Serif 4 (titles), Inter (UI), JetBrains Mono (numbers/quotes)
- Prisma 7 + PostgreSQL (driver adapter `@prisma/adapter-pg`), placeholder `Project` model, init migration
- `GET /api/health` -> `{ ok, db }`
- Temporary landing page
- Scripts: typecheck, db:migrate, db:deploy, db:seed, db:ensure-seed, seed:pipeline (placeholder)
- `render.yaml` Blueprint, `.env.example`, README stub

## Next
1. Full Prisma schema (domain model in CLAUDE.md) + authz (`src/lib/authz.ts`)
2. FestFlow fixtures in `seed/` + ground truth
3. Pipeline stages + LLM safety net (`src/lib/llm.ts`), `seed:pipeline`, cached result
4. App shell, "Viewing as" switcher, pages

## Known issues
- Not yet verified against a live Render deploy
- Prisma 7: generated client lives in `src/generated/prisma` (gitignored, created by `postinstall`/`prisma generate`)
- Local migrate needs a Postgres instance (none installed on this machine)
