# AGENTS.md

Instructions for AI coding agents working on the **gym-bot** repository.

## Project Overview

**gym-bot** is a multi-user gym class booking automation system targeting the external InfoYou TeamSystem portal (`inforyou.teamsystem.com/dream/api/v1`, `COMPANY_ID = 2`).

### Repository Map

- `web/` — React 18 + Tailwind CSS SPA (deployed to GitHub Pages via `.github/workflows/pages.yml`), with Jest unit tests (`*.test.js`, `*.test.jsx`).
- `supabase/functions/` — Deno Edge Functions acting as an authenticated proxy and automation engine for the gym portal:
  - `_shared/auth.ts` — server-side Supabase JWT verification (`requireAuth` via `auth.getUser`).
  - `_shared/http.ts` — origin-restricted CORS and JSON response helpers.
  - `_shared/crypto.ts` — AES-256-GCM encryption/decryption (Web Crypto API).
  - `_shared/gymClient.ts` — HTTP client for the InfoYou API with 10s timeouts and sanitized network errors.
  - `_shared/gymSession.ts` — encrypted 15-minute `AuthToken` cache (`public.gym_session_cache`) with automatic refresh on auth expiry.
  - `_shared/schedule.ts` — `Europe/Rome` date/time and 20-day booking window helpers.
  - `_shared/autoBook.ts` — core automated booking engine and constant-time `CRON_SECRET` verifier.
  - `_tests/` — offline Deno unit test suites (`gymSession_test.ts`, `autoBook_test.ts`).
  - Endpoints: `gym-login`, `gym-recover`, `gym-change-password`, `gym-courses`, `gym-calendar`, `gym-mybooks`, `gym-book`, `gym-cancel`, `gym-auto-book`.
- `supabase/migrations/` — Authoritative Postgres schema, RLS policies, and `acquire_booking_lock` PL/pgSQL function.
- `scripts/` — Local Windows PowerShell development scripts (`dev-start.ps1`, `dev-stop.ps1`).
- `.github/workflows/` — `ci.yml` (Deno + Jest + React build), `pages.yml` (GitHub Pages deploy), `deploy-supabase.yml` (migrations + Edge Functions deploy), and `book.yml` (scheduled `gym-auto-book` trigger).
- `docs/openapi/` — OpenAPI 3.0.3 specifications for both Edge Functions and the external InfoYou API.
- `docs/MAINTAINER.md` — Setup, testing, deployment, and security runbook.

## Architecture Invariants (Do Not Break)

1. **Cryptographic auth verification**:
   - User-facing Edge Functions run with `verify_jwt = false` at the gateway; `supabase/functions/_shared/auth.ts` **must** validate tokens via `supabaseAdmin.auth.getUser(authToken)`. Never decode JWT payloads without signature verification.
   - `gym-auto-book` **must** validate `Authorization: Bearer <CRON_SECRET>` using constant-time digest comparison (`verifyCronSecret`).
2. **AES-256-GCM format**: `supabase/functions/_shared/crypto.ts` stores `base64(12-byte random IV + ciphertext + 16-byte GCM tag)` using the 32-byte base64 `ENCRYPTION_KEY`. Never store plaintext passwords or plaintext `AuthToken`s in Postgres, and keep `public.gym_session_cache` restricted to `service_role` (RLS enabled with zero client policies).
3. **Exact lesson slot matching**: Preferences are stored as exact `(user_id, weekday, course, lesson_start_time)` slots. `supabase/functions/_shared/autoBook.ts` must match `ServiceDescription.trim().toLowerCase() === desiredCourse` (never substring `includes`) and exact `HH:MM:SS` start time.
4. **Waiting list field name**: The InfoYou API returns `UserPositionWaitingList` (not `WaitingListPosition`). Always check `UserPositionWaitingList` (with optional fallback) before booking to prevent duplicate bookings.
5. **Distributed locking & retry semantics**: `autoBook.ts` acquires a per-user daily lock via `acquire_booking_lock`. If any booking call returns `Successful: false` or throws an error, mark the lock `failed` (with 5-minute retry TTL), never `completed`. In `dryRun` mode, never acquire/modify locks and never call `bookLesson`.
6. **Timezone consistency**: Business dates, the `>= 07:00` time gate, and booking windows (`today` .. `today + 19`) must be computed in `Europe/Rome` via `Intl.DateTimeFormat`, not host local/UTC time.
7. **Atomic frontend preference saves**: In `web/src/App.js`, upsert new preference rows before deleting removed rows so partial failures never wipe a user's preferences.
8. **No redundant calendar refetches**: `loadCalendar` in `web/src/App.js` must not depend on `selectedDate` in `useCallback`; date selection must remain purely client-side.

## Security & Coding Standards

- **Language**: All code, comments, docstrings, commit messages, and documentation must be written in **English**.
- **Secrets**: Never log or print `ENCRYPTION_KEY`, `CRON_SECRET`, plaintext passwords, encrypted payloads/IVs, `Authorization` headers, or full URLs for `/security/webauthenticate` and `/security/changepassword`.
- **Environment files**: Never commit `.env`, `.env.local`, `supabase/.env`, `supabase/functions/.env`, or `web/.env.development`. Update `.env.example` / `web/.env.example` when introducing new variables.
- **CORS**: All Edge Functions must use `getCorsHeaders(req)` and `handleOptions(corsHeaders)` from `supabase/functions/_shared/http.ts`. Never reintroduce hardcoded `'Access-Control-Allow-Origin': '*'`.
- **API documentation**: Whenever an Edge Function endpoint or InfoYou API call is added or modified, update the corresponding OpenAPI spec in `docs/openapi/`.

## Verification Before Finishing Changes

Always run the relevant checks after editing code:

1. **Edge Function unit tests (Deno)**:
   ```powershell
   deno test --allow-env supabase/functions/_tests/
   ```
2. **Frontend unit tests & build** (when touching `web/`):
   ```powershell
   cd web
   $env:CI = "true"
   npm test -- --watchAll=false
   npm run build
   ```
3. **Git cleanliness**: Verify `git status` contains no untracked secret files or temporary debug scripts.
