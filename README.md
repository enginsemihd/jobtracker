# JobTrack

A standalone, self-hostable job application tracker with AI tailoring (Claude) and multi-source job search (Jooble, Adzuna, Remotive, RemoteOK) across Europe + Turkey. No Replit required.

## Stack
- **Frontend**: React + Vite + Tailwind CSS v4 (`artifacts/job-tracker`)
- **Backend**: Express 5 API (`artifacts/api-server`)
- **DB**: PostgreSQL via Drizzle ORM (`lib/db`) — works great with Supabase
- **Shared**: hand-written `@workspace/api-zod` (validators) + `@workspace/api-client-react` (React Query hooks)
- Monorepo managed with **pnpm workspaces**

## Prerequisites
- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- A PostgreSQL database (Supabase works out of the box)

## 1. Configure environment
Copy the example and fill it in:
```bash
cp .env.example .env
```
- `DATABASE_URL` — Supabase: Project Settings → Database → Connection string → URI. Use the **direct** connection (port 5432) and append `?sslmode=require`.
- `PORT` — leave at `8080` (the Vite dev proxy points here).
- `ANTHROPIC_API_KEY` — for AI tailoring.
- `JOOBLE_API_KEY` — primary job source (covers Turkey). Adzuna keys optional (no Turkey coverage).

## 2. Install
```bash
pnpm install
```

## 3. Create the database tables
```bash
pnpm db:push
```
Check your Supabase Table Editor — you should see `applications`, `profile`, and `tailored_content`.

## 4. Run (both servers together)
```bash
pnpm dev
```
- API → http://localhost:8080
- App → http://localhost:5173  ← open this

Or run them separately: `pnpm dev:api` and `pnpm dev:web`.

## Useful commands
| Command | What it does |
|---|---|
| `pnpm dev` | Run API + frontend together |
| `pnpm db:push` | Sync schema to your database |
| `pnpm db:studio` | Open Drizzle Studio (browse data) |
| `pnpm build` | Production build of the frontend (`artifacts/job-tracker/dist`) |
| `pnpm typecheck` | Typecheck all packages |

## Deploying to the web
The frontend talks to the backend at the same origin via `/api`. Simplest production setup:
1. `pnpm build` → static files in `artifacts/job-tracker/dist`.
2. Host the API (e.g. Render/Railway/Fly), set the same env vars there, run `pnpm --filter @workspace/api-server start`.
3. Serve the `dist` folder from the same origin as the API (reverse proxy `/api` → the Express server), **or** host the static frontend separately and add a proxy/rewrite so `/api/*` reaches the backend.
A managed Postgres (your Supabase instance) works for prod too — just reuse `DATABASE_URL`.

## Notes
- Job search fetches **all** matching pages per source (caps via `JOBS_MAX_PAGES` / `JOBS_MAX_RESULTS_PER_SOURCE`).
- Turkey coverage comes from Jooble (+ İŞKUR stub if an official API appears). Adzuna is skipped for Turkey automatically.
- Rotate any API key that was previously pasted into a plain document, and keep keys only in `.env` (which is git-ignored).
