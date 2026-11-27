# gym-bot

Automated multi-user gym class booking platform for the InfoYou TeamSystem portal (`inforyou.teamsystem.com`), built on a unified TypeScript/JavaScript stack: a **React 18 SPA** and **Supabase (Postgres + Auth + Deno Edge Functions)** triggered on schedule by GitHub Actions.

## Architecture

```mermaid
flowchart LR
  User["User Browser"] --> SPA["React SPA (GitHub Pages)"]
  SPA -->|Supabase Auth + RLS| DB["Supabase Postgres"]
  SPA -->|JWT Bearer| EF["Supabase Edge Functions (Deno)"]
  GHA["GitHub Actions Cron"] -->|Bearer CRON_SECRET| EF
  EF -->|AES-256-GCM Credentials & Session Cache| DB
  EF -->|HTTPS (10s timeout)| Portal["InfoYou Gym Portal API"]
```

### Components

- **Frontend (`web/`)**: React 18 + Tailwind CSS SPA for sign-in, weekly lesson slot preferences, automated booking run status, interactive calendar view, and manual booking/cancellation. Deployed to GitHub Pages via `.github/workflows/pages.yml`.
- **Edge Functions (`supabase/functions/`)**:
  - User-facing endpoints (`gym-login`, `gym-recover`, `gym-change-password`, `gym-courses`, `gym-calendar`, `gym-mybooks`, `gym-book`, `gym-cancel`) verify Supabase JWTs via `auth.getUser()`, reuse encrypted 15-minute InfoYou `AuthToken` sessions (`public.gym_session_cache`), and proxy requests to the gym portal.
  - Scheduled automation endpoint (`gym-auto-book`) authenticates machine-to-machine requests via `CRON_SECRET`, acquires per-user daily locks (`acquire_booking_lock`), and books exact preferred slots in the 20-day `Europe/Rome` booking window.
- **Database (`supabase/migrations/`)**: Authoritative Postgres schema with Row Level Security (RLS) on `public.users`, `public.preferences`, `public.booking_daily_lock`, and `public.gym_session_cache`.

## Quick Start (Local Development)

Prerequisites: **Node.js 20+**, **Docker Desktop**, **Supabase CLI 2.84+**, and **Deno 2.x**.

```powershell
# 1. Start local Supabase stack (Auth + Postgres + Edge Functions)
.\scripts\dev-start.ps1

# 2. Start React frontend (http://localhost:3000)
cd web
npm install
npm start
```

Run automated test suites:

```powershell
# Edge Functions unit tests (Deno)
deno test --allow-env supabase/functions/_tests/

# Frontend unit tests (Jest)
cd web
npm test -- --watchAll=false
```

Stop the local Supabase stack:

```powershell
.\scripts\dev-stop.ps1
```

## Documentation

- **Maintainer Guide** (setup, local testing, deployment runbook, secret rotation, troubleshooting): [docs/MAINTAINER.md](docs/MAINTAINER.md)
- **OpenAPI / Swagger Specifications**: [docs/openapi/README.md](docs/openapi/README.md)
  - [Supabase Edge Functions API](docs/openapi/edge-functions.yaml)
  - [External InfoYou Gym Portal API](docs/openapi/inforyou-api.yaml)
- **AI Agent Instructions**: [AGENTS.md](AGENTS.md)
- **Project Context**: [docs/project_context.md](docs/project_context.md)

## Security Highlights

- Gym passwords and cached InfoYou session tokens (`AuthToken`) are encrypted at rest with **AES-256-GCM** (`[12-byte IV | ciphertext]`, base64-encoded), and `ENCRYPTION_KEY` resides exclusively inside Supabase Secrets.
- User Edge Functions cryptographically verify Supabase JWTs server-side via `supabaseAdmin.auth.getUser(token)` (`supabase/functions/_shared/auth.ts`).
- `gym-auto-book` verifies `Authorization: Bearer <CRON_SECRET>` using constant-time SHA-256 digest comparison.
- CORS origins are restricted via `supabase/functions/_shared/http.ts` and configurable with `ALLOWED_ORIGINS`.
- Row Level Security enforces per-user isolation across all tables (`gym_session_cache` has zero client policies and is accessible only via `service_role`).
