# FestFlow

Registration and ticketing for **Kalrav 2026**, the annual cultural fest of
Vidyanagar College of Engineering (VCE), Pune. Fest dates: 30 April to 2 May 2026.

FestFlow handles event registration, team sign-ups, payments, QR e-tickets and
gate check-in for 41 events and an expected 6,000+ attendees.

## Repo layout

- `apps/web`: Next.js frontend (participant site and the admin desk)
- `apps/api`: Express + Prisma API
- `apps/scanner`: gate check-in PWA (camera QR scanner, works offline)
- `services/email-templates`: MJML email templates and the mail sender
- `packages/shared`: zod schemas and types shared by web and api

## Stack

- Auth: Firebase Authentication (Google sign-in and email link)
- Database: PostgreSQL
- Hosting: Vercel, with a preview deploy for every PR
- Payments: not decided yet (see #payments on Discord)

## Running locally

```bash
npm install
cp .env.example .env   # ask Meera for the dev values
npm run dev            # web on :3000, api on :4000
```

Requires Node 20+. On Windows use WSL; native Windows builds are not supported yet.

## Contributing

- Branch from `main`, open a PR, and get one approval from @meera-k before merging.
- Conventional commits: `feat(api): ...`, `fix(web): ...`.
- Ask in #dev on Discord before adding a dependency.

## Contact

Tech team: tech@festflow.dev
