# gym-bot

Personal automation for checking available gym courses via the `inforyou.teamsystem.com` API, written in Python.

## Features

- Authenticate with the gym portal using username and password
- Retrieve available lessons and filter them by weekday + keywords
- Supabase Edge Functions for credential verification
- Supabase Postgres storage for users and preferences
- React frontend for login + preferences management
- GitHub Actions job for automated daily booking

## Supabase (Edge Functions) Setup (Render-free)

This replaces the FastAPI backend with Supabase Edge Functions + RLS.

1. Create tables + policies in Supabase (SQL editor):

```sql
-- See db/supabase.sql
```

2. Configure Supabase secrets for the Edge Functions:

- `ENCRYPTION_KEY` (base64-encoded 32-byte key for AES-GCM)
- Optional: `GYM_APP_TOKEN` (if the portal token changes)

Note: Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` to Edge Functions. These
system secrets appear in the dashboard and cannot be removed, but you do not
need to add them manually.

3. Deploy Edge Functions from `supabase/functions`:

- `gym-login`
- `gym-courses`

4. Configure frontend env vars (see `C:\projects\gym-bot\web\README.md`).

Note: In Supabase Dashboard -> Edge Functions, keep "Verify JWT" disabled for
`gym-login` and `gym-courses`. The functions still validate the token via
`supabase.auth.getUser()`, but the gateway JWT check is unreliable for this setup.

## GitHub Pages (Production)

Production Pages are built via GitHub Actions (no `docs/` in the repo).

Required repository secrets:

- `REACT_APP_SUPABASE_URL` (production Supabase URL)
- `REACT_APP_SUPABASE_ANON_KEY` (production publishable key)

In GitHub: Settings -> Pages -> Source = GitHub Actions.

## Requirements

- Python 3.11+ in `PATH`
- Internet connection and valid gym portal credentials
- Supabase project (for DB + Edge Functions)
- Node.js 18+ (only if you want to run the React frontend)

## Local Setup (Windows / PowerShell)

All commands run from the project root:

```powershell
cd C:\projects\gym-bot
```

### 1. Create and Activate Virtual Environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If script execution is blocked:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 3. Generate Encryption Key

This key is required by the booking job to decrypt passwords stored in Supabase.

```powershell
python -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"
```

Keep the output, you will use it as `ENCRYPTION_KEY` in Supabase and GitHub Actions.

### 4. Configure Environment Variables

Create a `.env` file in the project root (only needed for the booking script if you run it locally):

```dotenv
ENCRYPTION_KEY=your_generated_key_here
DATABASE_URL=your_database_connection_string
```

If the gym changes the app token, you can optionally add:

```dotenv
GYM_APP_TOKEN=APP_TOKEN_VALUE_FROM_PORTAL
```

### 5. (Optional) Use Local Postgres (Docker)

If you want to test the booking script locally with Postgres, you can run a local DB:

```powershell
docker run --name gym-bot-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=gym_bot -p 5432:5432 -d postgres:16
```

Initialize the schema:

```powershell
Get-Content db\schema.sql | docker exec -i gym-bot-db psql -U postgres -d gym_bot
```

If the container already exists, just start it:

```powershell
docker start gym-bot-db
```

Use this connection string in your `.env`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gym_bot
```

### 6. Local Supabase Dev (Recommended for UI testing)

This starts the full Supabase stack locally (Auth + DB + Edge Functions).

```powershell
.\scripts\dev-start.ps1
```

The script will:

- start Supabase locally (Docker)
- write `supabase\.env` and `supabase\functions\.env` (UTF-8, no BOM) with `ENCRYPTION_KEY` + optional `GYM_APP_TOKEN`
- set `web\.env.development` with local URL + publishable key
- reset the local database schema

If you see `failed to parse environment file: .env` during startup, delete `supabase\.env` and rerun the script.

To stop the local stack:

```powershell
.\scripts\dev-stop.ps1
```

Ignored local files (recreated by scripts/CLI):

- `C:\projects\gym-bot\.env.local` (local secrets cache)
- `C:\projects\gym-bot\web\.env.development`
- `C:\projects\gym-bot\supabase\.branches\`
- `C:\projects\gym-bot\supabase\.temp\`
- `C:\projects\gym-bot\web\supabase\`

### 7. (Optional) Run the React Frontend

```powershell
cd web
npm install
```

The script writes `web\.env.development` with the local Supabase URL and publishable key.

Start the frontend:

```powershell
npm start
```

The web app runs at `http://localhost:3000`.

## GitHub Actions Automation

The project includes `.github/workflows/book.yml` which runs daily at 07:XX Europe/Rome.

Required secrets:

- `ENCRYPTION_KEY`: AES-GCM key used to decrypt stored passwords
- `DATABASE_URL`: Postgres connection string reachable by the runner

The workflow runs `scripts/book_all_users.py`.

## Reliable Booking Automation (Edge Functions)

To improve reliability, run the booking edge function every 30 minutes during a
morning window (ex: 07:00-09:30 Europe/Rome). Each run checks:

- It is after 07:00 local time
- The user has not already booked today
- A distributed lock can be acquired in Supabase

Use a single-row-per-user-per-day lock so the booking job is idempotent and safe
to re-run if the cron triggers multiple times or the provider is unreliable.

## Project Structure

- `src/gym_bot/client.py`: HTTP calls (login, lessons, booking)
- `src/gym_bot/config.py`: credentials + token config
- `src/gym_bot/schedule.py`: time windows and filters
- `api/storage.py`: Postgres storage layer
- `scripts/book_all_users.py`: GitHub Actions job

## Security Notes

- **Never** commit real credentials
- Prefer environment variables
