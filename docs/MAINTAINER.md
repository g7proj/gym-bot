# Maintainer Guide

This guide covers environment setup, local testing, production deployment, security standards, and operational troubleshooting for **gym-bot**.

---

## 1. Prerequisites

| Tool | Recommended Version | Purpose |
| --- | --- | --- |
| Python | 3.11 or 3.12 | Booking automation script and unit tests |
| Node.js / npm | Node 20+ | React frontend (`web/`) |
| Docker Desktop | Latest | Local Supabase stack (Postgres, GoTrue, Edge Runtime, Studio) |
| Supabase CLI | 2.x | Local stack management, DB migrations, Edge Functions deploy |
| Deno (optional) | 2.x | Local type-checking of Edge Functions |

---

## 2. Environment Setup

### 2.1 Python Virtual Environment

```powershell
cd C:\projects\gym-bot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PowerShell blocks script execution:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2.2 Environment Files & Secrets

Copy the provided templates as needed (never commit populated env files):

- Root (`.env`, copied from `.env.example`): used only when running `scripts/book_all_users.py` locally.
- Local secrets cache (`.env.local`): managed automatically by `scripts/dev-start.ps1`.
- Frontend (`web/.env.development`, copied from `web/.env.example`): written automatically by `scripts/dev-start.ps1` with local Supabase URL and publishable key.

Generate a 32-byte AES-256-GCM `ENCRYPTION_KEY`:

```powershell
python -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"
```

### 2.3 Local Supabase Stack

Start Docker Desktop, then run:

```powershell
.\scripts\dev-start.ps1
```

This script:
1. Prompts for (or loads from `.env.local`) `ENCRYPTION_KEY` and optional `GYM_APP_TOKEN`.
2. Writes UTF-8 (no BOM) env files to `supabase/.env` and `supabase/functions/.env`.
3. Starts the local Supabase containers (`supabase start`).
4. Writes `web/.env.development` with the local API URL and publishable key.
5. Resets and applies all SQL migrations (`supabase db reset`).

Local endpoints once started:
- Supabase API / Edge Functions: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Local Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

To stop the stack cleanly:

```powershell
.\scripts\dev-stop.ps1
```

### 2.4 React Frontend

```powershell
cd C:\projects\gym-bot\web
npm install
npm start
```

The SPA runs at `http://localhost:3000`.

---

## 3. Local Testing

### 3.1 Python Unit Tests

```powershell
cd C:\projects\gym-bot
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

Tests verify:
- AES-256-GCM round-trip encryption/decryption with zero secret output to `stdout`.
- Exact course-name and start-time matching (`find_matching_lesson`).
- Waiting-list detection for both `UserPositionWaitingList` and `WaitingListPosition`.
- Timezone-aware booking window calculation.
- Marking the daily booking lock as `failed` (so cron retries) when the portal returns `Successful: false`.

### 3.2 Frontend Production Build Check

```powershell
cd C:\projects\gym-bot\web
npm run build
```

### 3.3 Edge Functions Verification

1. **Forged JWT rejection test** (must return `401 Unauthorized`):

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:54321/functions/v1/gym-courses" `
  -Method POST `
  -Headers @{
    Authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImlzcyI6Imh0dHA6Ly8xMjcuMC4wLjE6NTQzMjEvYXV0aC92MSIsImV4cCI6OTk5OTk5OTk5OX0.invalid"
  }
```

2. **Authenticated Edge Function smoke test**: sign in via `http://localhost:3000`, copy the Bearer token from DevTools Network tab, and invoke `gym-courses`, `gym-calendar`, or `gym-mybooks`.

3. **Portal login diagnostic** (if gym portal login fails unexpectedly):

```powershell
.\.venv\Scripts\python.exe scripts\check_gym_login.py
```

4. **Edge Runtime logs** (local Docker):

```powershell
docker logs supabase_edge_runtime_gym-bot --tail 60
```

### 3.4 Manual UI Checklist

- Sign in with valid gym credentials succeeds and populates `public.users`.
- Sign in with wrong credentials displays `Wrong credentials`.
- Clicking different dates in **Calendar** updates the side panel immediately without re-fetching `gym-calendar` or `gym-mybooks`.
- Saving and removing lesson slots in **Preferences** persists across page reloads.
- Booked classes show `Booked`; waitlisted classes show `WL #N` and a `Cancel` action.

---

## 4. Production Deployment

Production spans three surfaces: **Supabase (DB + Edge Functions)**, **GitHub Pages (Frontend)**, and **GitHub Actions (Daily Booking Cron)**.

### 4.1 Required Secrets

#### Supabase Project Secrets (Edge Functions)

Set via CLI or Supabase Dashboard → Project Settings → Edge Functions → Secrets:

```powershell
supabase secrets set ENCRYPTION_KEY="<32-byte-base64-key>"
supabase secrets set APP_TIMEZONE="Europe/Rome"
supabase secrets set ALLOWED_ORIGINS="https://g7proj.github.io"
# Optional if the portal rotates its AppToken:
# supabase secrets set GYM_APP_TOKEN="<portal-app-token>"
```

> Supabase automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`.

#### GitHub Repository Secrets

Configure in GitHub → Settings → Secrets and variables → Actions:

| Secret | Used By | Description |
| --- | --- | --- |
| `ENCRYPTION_KEY` | `book.yml` | **Must match** the Supabase `ENCRYPTION_KEY` |
| `DATABASE_URL` | `book.yml` | Postgres connection string reachable from GitHub runners |
| `REACT_APP_SUPABASE_URL` | `pages.yml` | Production Supabase project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | `pages.yml` | Production Supabase publishable/anon key |

### 4.2 Deploying Database Migrations

Link the CLI once to your production project:

```powershell
supabase login
supabase link --project-ref <your-project-ref>
```

Push pending migrations:

```powershell
supabase db push
```

### 4.3 Deploying Supabase Edge Functions

Whenever any function or shared module (`supabase/functions/_shared/*`) changes, redeploy all affected functions with `--no-verify-jwt` (each function performs cryptographic JWT verification via `requireAuth` / `auth.getUser()`):

```powershell
$functions = @(
  "gym-login",
  "gym-recover",
  "gym-change-password",
  "gym-courses",
  "gym-calendar",
  "gym-mybooks",
  "gym-book",
  "gym-cancel"
)
foreach ($fn in $functions) {
  supabase functions deploy $fn --no-verify-jwt
}
```

### 4.4 Deploying Frontend & Booking Job

- **Frontend (GitHub Pages)**: automatically built and deployed on every push to `main` via `.github/workflows/pages.yml` (Settings → Pages → Source = **GitHub Actions**).
- **Daily Booking Job**: automatically runs from `main` via `.github/workflows/book.yml` on schedule (`0,30 4-7 * * *`) or manually via **Actions → Daily Gym Booking → Run workflow**.

---

## 5. Security Standards & Secret Rotation

### 5.1 Coding & Security Rules

- **Never log secrets**: never print `ENCRYPTION_KEY`, decrypted passwords, raw `Authorization` headers, or full `/security/webauthenticate` / `/security/changepassword` URLs (which contain passwords as query parameters).
- **Server-side JWT verification**: always validate tokens through `supabaseAdmin.auth.getUser(token)` in `supabase/functions/_shared/auth.ts`. Never trust unverified base64-decoded JWT claims.
- **Keep AES-GCM format identical** across Python (`utils/crypto.py`) and Deno (`supabase/functions/_shared/crypto.ts`): `base64(12-byte IV || ciphertext || 16-byte tag)`.
- **Atomic preference updates**: always upsert new preference rows before deleting removed ones.

### 5.2 Rotating `ENCRYPTION_KEY`

If `ENCRYPTION_KEY` is ever exposed or needs rotation:

1. Generate a new 32-byte base64 key.
2. Re-encrypt all rows in `public.users.password_encrypted` using a one-off local migration script (decrypt with old key, encrypt with new key) — or ask all users to sign in again after updating the secret (each `gym-login` re-encrypts the password with the active key).
3. Update `ENCRYPTION_KEY` simultaneously in **Supabase Secrets** and **GitHub Actions Secrets**.
4. Verify a test login via the web app and trigger a manual `Daily Gym Booking` workflow run.

---

## 6. Troubleshooting

### `503 {"message": "name resolution failed"}` in local Edge Functions

On Windows, Docker Desktop containers may fail to resolve external DNS names (`inforyou.teamsystem.com`).

Fix:
1. Open **Docker Desktop → Settings → Docker Engine**.
2. Add `"dns": ["8.8.8.8", "8.8.4.4"]` to the JSON config and click **Apply & Restart**.
3. Restart the local stack: `.\scripts\dev-stop.ps1` followed by `.\scripts\dev-start.ps1`.

### `failed to parse environment file: .env` on `supabase start`

Delete `supabase/.env` and `supabase/functions/.env`, then re-run `.\scripts\dev-start.ps1` (the script writes UTF-8 without BOM).

### `web/.env.development` shows as modified in `git status`

If the file was previously tracked before being added to `.gitignore`, untrack it once without deleting your local copy:

```powershell
git rm --cached web/.env.development
```
