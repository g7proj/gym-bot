# AGENTS.md

Instructions for AI coding agents working on the **gym-bot** repository.

## Project Overview

**gym-bot** is a multi-user gym class booking automation system targeting the external InfoYou TeamSystem portal (`inforyou.teamsystem.com/dream/api/v1`, `COMPANY_ID = 2`).

### Repository Map

- `web/` — React 18 + Tailwind CSS SPA (deployed to GitHub Pages via `.github/workflows/pages.yml`).
- `supabase/functions/` — Deno Edge Functions acting as an authenticated proxy to the gym portal:
  - `_shared/auth.ts` — server-side JWT verification (`requireAuth`).
  - `_shared/http.ts` — origin-restricted CORS and JSON response helpers.
  - `_shared/crypto.ts` — AES-256-GCM encryption/decryption (Web Crypto API).
  - `_shared/gymClient.ts` — HTTP client for the InfoYou API.
  - `_shared/schedule.ts` — `Europe/Rome` date/time formatting helpers.
  - Endpoints: `gym-login`, `gym-recover`, `gym-change-password`, `gym-courses`, `gym-calendar`, `gym-mybooks`, `gym-book`, `gym-cancel`.
- `supabase/migrations/` — Authoritative Postgres schema, RLS policies, and `acquire_booking_lock` function.
- `scripts/book_all_users.py` — Scheduled Python booking runner executed by `.github/workflows/book.yml`.
- `src/gym_bot/` — Python InfoYou client (`client.py`), config (`config.py`), and schedule helpers (`schedule.py`).
- `api/` — Python Postgres storage layer (`storage.py`) and Pydantic models (`models.py`).
- `utils/crypto.py` — Python AES-256-GCM utility (must remain wire-compatible with `_shared/crypto.ts`).
- `tests/` — Python `unittest` suite.
- `docs/openapi/` — OpenAPI 3.0.3 specifications for both Edge Functions and the external InfoYou API.
- `docs/MAINTAINER.md` — Setup, testing, deployment, and security runbook.

## Architecture Invariants (Do Not Break)

1. **Cryptographic JWT verification**: Edge Functions run with `verify_jwt = false` at the gateway; `supabase/functions/_shared/auth.ts` **must** validate tokens via `supabaseAdmin.auth.getUser(authToken)`. Never decode JWT payloads without signature verification.
2. **AES-256-GCM cross-runtime compatibility**: `utils/crypto.py` (Python) and `supabase/functions/_shared/crypto.ts` (Deno) share the exact same format: `base64(12-byte random IV + ciphertext + 16-byte GCM tag)` using the 32-byte base64 `ENCRYPTION_KEY`. Any change to one must be mirrored in the other.
3. **Exact lesson slot matching**: Preferences are stored as exact `(user_id, weekday, course, lesson_start_time)` slots. `scripts/book_all_users.py` must match `ServiceDescription.strip().lower() == desired_course` (never substring `in`) and exact `HH:MM:SS` start time.
4. **Waiting list field name**: The InfoYou API returns `UserPositionWaitingList` (not `WaitingListPosition`). Always check `UserPositionWaitingList` (with optional fallback) before booking to prevent duplicate bookings.
5. **Distributed locking & retry semantics**: `scripts/book_all_users.py` acquires a per-user daily lock via `acquire_booking_lock`. If any booking call returns `Successful: false` or raises an exception, mark the lock `failed` (with retry TTL), never `completed`.
6. **Timezone consistency**: Business dates and booking windows (`today` .. `today + 19`) must be computed in `Europe/Rome`, not UTC. Database `timestamptz` values written from Python must be timezone-aware (`datetime.now(timezone.utc)`).
7. **Atomic frontend preference saves**: In `web/src/App.js`, upsert new preference rows before deleting removed rows so partial failures never wipe a user's preferences.
8. **No redundant calendar refetches**: `loadCalendar` in `web/src/App.js` must not depend on `selectedDate` in `useCallback`; date selection must remain purely client-side.

## Security & Coding Standards

- **Language**: All code, comments, docstrings, commit messages, and documentation must be written in **English**.
- **Secrets**: Never log or print `ENCRYPTION_KEY`, plaintext passwords, encrypted payloads/IVs, `Authorization` headers, or full URLs for `/security/webauthenticate` and `/security/changepassword`.
- **Environment files**: Never commit `.env`, `.env.local`, `supabase/.env`, `supabase/functions/.env`, or `web/.env.development`. Update `.env.example` / `web/.env.example` when introducing new variables.
- **CORS**: All Edge Functions must use `getCorsHeaders(req)` and `handleOptions(corsHeaders)` from `supabase/functions/_shared/http.ts`. Never reintroduce hardcoded `'Access-Control-Allow-Origin': '*'`.
- **API documentation**: Whenever an Edge Function endpoint or InfoYou API call is added or modified, update the corresponding OpenAPI spec in `docs/openapi/`.

## Verification Before Finishing Changes

Always run the relevant checks after editing code:

1. **Python unit tests**:
   ```powershell
   .\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
   ```
2. **Frontend build** (when touching `web/`):
   ```powershell
   cd web
   npm run build
   ```
3. **Git cleanliness**: Verify `git status` contains no untracked secret files or temporary debug scripts.
