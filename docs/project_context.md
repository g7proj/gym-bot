# Project Context

## Overview

Multi-user gym class booking automation system built on a unified TypeScript/JavaScript architecture:
- **React SPA (`web/`)**: user authentication, weekly slot preferences, automated booking run status, calendar view, and manual booking/cancellation.
- **Supabase (`supabase/`)**: Postgres (with RLS), Auth, and Deno Edge Functions (`supabase/functions/`).
- **GitHub Actions (`.github/workflows/book.yml`)**: lightweight cron trigger invoking `gym-auto-book` over HTTPS with `CRON_SECRET`.
- **External Gym API**: InfoYou TeamSystem (`inforyou.teamsystem.com/dream/api/v1`, `COMPANY_ID = 2`).

## Key Concepts

- Users authenticate with their gym portal credentials; passwords (`public.users.password_encrypted`) and short-lived InfoYou `AuthToken`s (`public.gym_session_cache.token_encrypted`, 15m TTL) are stored encrypted at rest with AES-256-GCM.
- Preferences define exact weekly lesson slots `(weekday, course, lesson_start_time)` in `public.preferences`.
- Edge Functions (`supabase/functions/`):
  - `gym-login` — verify portal credentials, upsert encrypted password, and warm `gym_session_cache`.
  - `gym-recover` — recover Supabase Auth password after validating gym credentials.
  - `gym-change-password` — change portal password, sync Supabase Auth + DB, and invalidate cached session.
  - `gym-courses` — distinct `CORSI FIT` lesson slots for the next rolling week.
  - `gym-calendar` — `CORSI FIT` classes for current and next month.
  - `gym-mybooks` — active bookings and waitlist positions for the user.
  - `gym-book` — book a seat or join the waitlist.
  - `gym-cancel` — cancel a booking or leave the waitlist.
  - `gym-auto-book` — `CRON_SECRET`-authenticated automated booking runner for all users (supports `dryRun` and `forceTime`).

## Automated Booking Logic (`gym-auto-book`)

- Triggered punctually at **07:01:00 `Europe/Rome`** via Supabase `pg_cron` + `pg_net` (`20261129_pg_cron_auto_book.sql`, reading URL and `CRON_SECRET` from Supabase Vault), with a single daily backup and Free-Tier keep-alive run in `.github/workflows/book.yml` (`17 7 * * *` UTC).
- Acquires an atomic per-user daily lock in `public.booking_daily_lock` via `acquire_booking_lock`.
- Evaluates the 20-day booking window (`today` .. `today + 19` in `Europe/Rome`) and matches exact course name + `HH:MM:SS` start time on `today + 19`.
- Skips lessons where `IsUserPresent == 1` or `UserPositionWaitingList > 0`.
- Marks the lock `failed` (5-minute retry TTL) if any booking fails or throws; marks `completed` otherwise.

## Future Ideas

- Opt-in per-user automatic waitlist enrollment (`AddWait`) in `gym-auto-book` when `AvailablePlaces == 0`.
- Optional Telegram/email notifications on automated booking completion or failure.
