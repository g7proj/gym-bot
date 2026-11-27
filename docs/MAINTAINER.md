# Maintainer Guide

This guide covers environment setup, local testing, production deployment, security standards, and operational troubleshooting for **gym-bot**.

---

## 1. Prerequisites

| Tool | Recommended Version | Purpose |
| --- | --- | --- |
| Node.js / npm | Node 20+ | React frontend (`web/`) and Jest unit tests |
| Docker Desktop | Latest | Local Supabase stack (Postgres, GoTrue, Edge Runtime, Studio) |
| Supabase CLI | 2.84.x | Local stack management, DB migrations, Edge Functions deploy |
| Deno | 2.x | Edge Functions unit tests and type-checking |

---

## 2. Environment Setup

### 2.1 Environment Files & Secrets

Never commit populated environment files. Templates are provided at `.env.example` and `web/.env.example`:

- `.env.local`: managed automatically by `scripts/dev-start.ps1` (stores local `ENCRYPTION_KEY`, `CRON_SECRET`, and optional `GYM_APP_TOKEN`).
- `supabase/.env` & `supabase/functions/.env`: generated automatically (UTF-8, no BOM) by `scripts/dev-start.ps1`.
- `web/.env.development`: generated automatically by `scripts/dev-start.ps1` with local Supabase URL and publishable key.

Generate a 32-byte AES-256-GCM `ENCRYPTION_KEY` in PowerShell if needed for production:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### 2.2 Local Supabase Stack

Start Docker Desktop, then run:

```powershell
cd C:\projects\gym-bot
.\scripts\dev-start.ps1
```

This script:
1. Loads or generates `ENCRYPTION_KEY`, `CRON_SECRET`, and optional `GYM_APP_TOKEN` in `.env.local`.
2. Writes UTF-8 (no BOM) env files to `supabase/.env` and `supabase/functions/.env`.
3. Starts the local Supabase containers (`supabase start`).
4. Writes `web/.env.development` with the local API URL and publishable key.
5. Resets and applies all SQL migrations (`supabase db reset`) and ensures `supabase_edge_runtime_gym-bot` is running.

Local endpoints once started:
- Supabase API / Edge Functions: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Local Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

To stop the stack cleanly:

```powershell
.\scripts\dev-stop.ps1
```

### 2.3 React Frontend

```powershell
cd C:\projects\gym-bot\web
npm install
npm start
```

The SPA runs at `http://localhost:3000`.

---

## 3. Local Testing

### 3.1 Edge Function Unit Tests (Deno)

```powershell
cd C:\projects\gym-bot
deno test --allow-env supabase/functions/_tests/
```

Covers:
- AES-256-GCM round-trip encryption/decryption and invalid payload rejection.
- Encrypted `AuthToken` session cache hit, miss, TTL expiration, auto-refresh on `401`, and non-retry on business errors.
- Constant-time `CRON_SECRET` verification (`verifyCronSecret`).
- `Europe/Rome` 20-day booking window, time gate (`>= 07:00`), exact course/time slot matching, `UserPositionWaitingList` checks, lock failure/retry semantics, and `dryRun` isolation.

### 3.2 Frontend Unit Tests & Production Build

```powershell
cd C:\projects\gym-bot\web
$env:CI = "true"
npm test -- --watchAll=false
npm run build
```

### 3.3 Local Dry-Run of Automated Booking (`gym-auto-book`)

With the local stack running, read `CRON_SECRET` from `.env.local` and invoke `gym-auto-book` in dry-run mode (with `forceTime: true` if testing before 07:00):

```powershell
$cronSecret = (Get-Content .env.local | Where-Object { $_ -like "CRON_SECRET=*" }).Split("=", 2)[1]
Invoke-RestMethod -Uri "http://127.0.0.1:54321/functions/v1/gym-auto-book" `
  -Method POST `
  -Headers @{
    Authorization = "Bearer $cronSecret"
    "Content-Type" = "application/json"
  } `
  -Body '{"dryRun": true, "forceTime": true}' | ConvertTo-Json -Depth 6
```

### 3.4 Forged JWT Rejection Check

Verify that user-facing Edge Functions reject forged unsigned JWTs with `401 Unauthorized`:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:54321/functions/v1/gym-courses" `
  -Method POST `
  -Headers @{
    Authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImlzcyI6Imh0dHA6Ly8xMjcuMC4wLjE6NTQzMjEvYXV0aC92MSIsImV4cCI6OTk5OTk5OTk5OX0.invalid"
  }
```

### 3.5 Edge Runtime Logs (Local Docker)

```powershell
docker logs supabase_edge_runtime_gym-bot --tail 60
```

---

## 4. Production Deployment

Production spans three surfaces: **Supabase (DB + Edge Functions)**, **GitHub Pages (Frontend)**, and **GitHub Actions (Scheduled Cron Trigger)**.

### 4.1 Required Secrets

#### Supabase Project Secrets (Edge Functions)

```powershell
supabase secrets set ENCRYPTION_KEY="<32-byte-base64-key>"
supabase secrets set CRON_SECRET="<random-strong-secret>"
supabase secrets set APP_TIMEZONE="Europe/Rome"
supabase secrets set ALLOWED_ORIGINS="https://g7proj.github.io"
# Optional: override InfoYou AuthToken cache TTL in minutes (default: 15)
# supabase secrets set GYM_TOKEN_TTL_MINUTES="15"
# Optional if the portal rotates its AppToken:
# supabase secrets set GYM_APP_TOKEN="<portal-app-token>"
```

> Supabase automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`. Neither `ENCRYPTION_KEY` nor direct `DATABASE_URL` needs to be stored in GitHub Actions anymore.

#### GitHub Repository Secrets

Configure in GitHub → Settings → Secrets and variables → Actions:

| Secret | Used By | Description |
| --- | --- | --- |
| `CRON_SECRET` | `book.yml` | **Must match** the Supabase `CRON_SECRET` |
| `SUPABASE_PROJECT_REF` | `book.yml`, `deploy-supabase.yml` | Supabase project reference ID (Project Settings → General) |
| `SUPABASE_ACCESS_TOKEN` | `deploy-supabase.yml` | Personal access token from Supabase Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | `deploy-supabase.yml` | Database password used by `supabase db push` |
| `REACT_APP_SUPABASE_URL` | `pages.yml` | Production Supabase project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | `pages.yml` | Production Supabase publishable/anon key |

> Legacy GitHub Secrets `ENCRYPTION_KEY` and `DATABASE_URL` are no longer used by any workflow and can be safely deleted from GitHub Actions Secrets once PR 3 is deployed.

### 4.2 Deploying Database Migrations & Edge Functions

Pushes to `main` touching `supabase/migrations/**`, `supabase/functions/**`, or `supabase/config.toml` automatically run `supabase db push --yes` and redeploy all Edge Functions with `--no-verify-jwt` via `.github/workflows/deploy-supabase.yml`.

Manual CLI fallback if ever needed:

```powershell
supabase login
supabase link --project-ref <your-project-ref>
supabase db push --yes

Get-ChildItem supabase\functions -Directory |
  Where-Object { $_.Name -notlike "_*" } |
  ForEach-Object { supabase functions deploy $_.Name --no-verify-jwt }
```

### 4.3 Deploying Frontend & Scheduling Automated Bookings

- **Frontend (GitHub Pages)**: automatically built and deployed on every push to `main` via `.github/workflows/pages.yml` (Settings → Pages → Source = **GitHub Actions**).
- **Primary 07:01 Scheduler (Supabase `pg_cron` + `pg_net` + `Vault`)**:
  - Migration `20261129_pg_cron_auto_book.sql` registers the `gym-auto-book-daily` cron job (`1 5,6 * * *` UTC, filtered in `public.trigger_gym_auto_book()` to fire only at **07:01:00 `Europe/Rome`** across both CET and CEST).
  - Configure the two required Vault secrets **once** in the production **Supabase SQL Editor**:
    ```sql
    -- Replace placeholders with your production project ref and CRON_SECRET
    select vault.create_secret(
      'https://<your-project-ref>.supabase.co/functions/v1/gym-auto-book',
      'gym_auto_book_url',
      'Production gym-auto-book Edge Function URL'
    );

    select vault.create_secret(
      '<your-cron-secret>',
      'gym_cron_secret',
      'Bearer secret for gym-auto-book'
    );
    ```
  - To update an existing Vault secret later (e.g. when rotating `CRON_SECRET`), update it via Dashboard → **Integrations → Vault** or `vault.update_secret(id, '<new-secret>')`.
- **Backup & Keep-Alive Job (`.github/workflows/book.yml`)**: runs once daily (`17 7 * * *` UTC) to keep the Supabase Free Tier project active (preventing the 7-day inactivity pause) and retry any failed 07:01 booking, and can also be triggered manually via **Actions → Daily Gym Booking → Run workflow** (`dry_run` / `force_time`).

---

## 5. Security Standards & Secret Rotation

### 5.1 Coding & Security Rules

- **Never log secrets**: never print `ENCRYPTION_KEY`, `CRON_SECRET`, decrypted passwords, raw `Authorization` headers, or full `/security/webauthenticate` / `/security/changepassword` URLs.
- **Server-side auth verification**: user endpoints validate JWTs via `supabaseAdmin.auth.getUser(token)` (`_shared/auth.ts`); `gym-auto-book` validates `CRON_SECRET` via constant-time digest comparison (`_shared/autoBook.ts`).
- **Atomic preference updates**: always upsert new preference rows before deleting removed ones.

### 5.2 Rotating `ENCRYPTION_KEY`

1. Generate a new 32-byte base64 key.
2. Update `ENCRYPTION_KEY` in **Supabase Secrets** (`supabase secrets set ENCRYPTION_KEY="..."`).
3. Have active users sign in once via the web app (each `gym-login` re-encrypts `users.password_encrypted` and refreshes `gym_session_cache` with the active key).

### 5.3 Rotating `CRON_SECRET`

1. Generate a new random secret string.
2. Update `CRON_SECRET` in **Supabase Edge Function Secrets**, **Supabase Vault** (`gym_cron_secret`), and **GitHub Repository Secrets**.
3. Trigger a manual `Daily Gym Booking` dry-run in GitHub Actions to verify `200 OK`.

---

## 6. Troubleshooting

### `503 {"message": "name resolution failed"}` in local Edge Functions

1. **Stopped `supabase_edge_runtime_gym-bot` container** (after Windows/Docker sleep, Kong fails internal DNS resolution for the edge runtime container):
   ```powershell
   docker start supabase_edge_runtime_gym-bot
   ```
2. **External DNS resolution inside Docker Desktop on Windows**:
   - Open **Docker Desktop → Settings → Docker Engine**, add `"dns": ["8.8.8.8", "8.8.4.4"]`, click **Apply & Restart**, then re-run `.\scripts\dev-stop.ps1` and `.\scripts\dev-start.ps1`.

### `failed to parse environment file: .env` on `supabase start`

Delete `supabase/.env` and `supabase/functions/.env`, then re-run `.\scripts\dev-start.ps1`.
