# gym-bot

Personal automation for checking available gym courses via the `inforyou.teamsystem.com` API, written in Python.

## Features

- Authenticate with the gym portal using username and password
- Retrieve available lessons and filter them by weekday + keywords
- Multi-user REST API (FastAPI) with encrypted credentials
- Postgres-backed storage for users and preferences
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

## GitHub Pages (Production)

Production Pages are built via GitHub Actions (no `docs/` in the repo).

Required repository secrets:

- `REACT_APP_SUPABASE_URL` (production Supabase URL)
- `REACT_APP_SUPABASE_ANON_KEY` (production publishable key)

In GitHub: Settings → Pages → Source = GitHub Actions.

## Requirements

- Python 3.11+ in `PATH`
- Internet connection and valid gym portal credentials
- Postgres 14+ (local install) **or** Docker Desktop
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

This key is required by the API to encrypt/decrypt passwords.

```powershell
python -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"
```

Keep the output, you will use it as `ENCRYPTION_KEY`.

### 4. Start a Local Postgres Database

You can use either Docker (recommended) or a local Postgres install.

#### Option A: Docker (Recommended)

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

#### Option B: Local Postgres Install

Create database and schema (using `psql`):

```powershell
createdb -U postgres gym_bot
psql -U postgres -d gym_bot -f db\schema.sql
```

### 5. Configure Environment Variables

Create a `.env` file in the project root:

```dotenv
ENCRYPTION_KEY=your_generated_key_here
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gym_bot
```

If the gym changes the app token, you can optionally add:

```dotenv
GYM_APP_TOKEN=APP_TOKEN_VALUE_FROM_PORTAL
```

### 6. Run the API Server

```powershell
uvicorn api.main:app --reload --env-file .env
```

Open the docs at `http://127.0.0.1:8000/docs`.

### 7. (Optional) Run the React Frontend

```powershell
cd web
npm install
```

Create `web\.env`:

```
REACT_APP_API_URL=http://127.0.0.1:8000
```

Start the frontend:

```powershell
npm start
```

The web app runs at `http://localhost:3000`.

## Local API Testing (PowerShell)

Login (creates/updates user and returns `user_id`):

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/login" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"username": "your_username", "password": "your_password"}'
```

Fetch available courses for the next 7 days:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/users/your_user_id/courses" -Method GET
```

Update preferences:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/users/your_user_id/preferences" `
  -Method PUT `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"by_day": {"monday": ["yoga"], "tuesday": ["weightlifting"]}}'
```

Fetch user data:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/users/your_user_id" -Method GET
```

## API Endpoints

- `POST /login`: verify credentials and create/update user
- `GET /users/{user_id}`: get user data
- `GET /users/{user_id}/courses`: available courses grouped by weekday
- `PUT /users/{user_id}/preferences`: update course preferences
- `GET /wake`: health check

## GitHub Actions Automation

The project includes `.github/workflows/book.yml` which runs daily at 07:XX Europe/Rome.

Required secrets:

- `ENCRYPTION_KEY`: AES-GCM key used to decrypt stored passwords
- `DATABASE_URL`: Postgres connection string reachable by the runner

The workflow runs `scripts/book_all_users.py`.

## Project Structure

- `src/gym_bot/client.py`: HTTP calls (login, lessons, booking)
- `src/gym_bot/config.py`: credentials + token config
- `src/gym_bot/schedule.py`: time windows and filters
- `api/main.py`: FastAPI app and endpoints
- `api/storage.py`: Postgres storage layer
- `scripts/book_all_users.py`: GitHub Actions job

## Security Notes

- **Never** commit real credentials
- Prefer environment variables
