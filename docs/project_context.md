# Project Context

## Overview

Multi-user gym class booking automation system built with:
- **React SPA (`web/`)**: user authentication, weekly slot preferences, calendar view, and manual booking/cancellation.
- **Supabase**: Postgres (with RLS), Auth, and Deno Edge Functions (`supabase/functions/`).
- **Python Automation (`scripts/book_all_users.py`)**: GitHub Actions cron runner with Postgres distributed locking.
- **External Gym API**: InfoYou TeamSystem (`inforyou.teamsystem.com/dream/api/v1`, `COMPANY_ID = 2`).

## Key Concepts

- Users authenticate with their gym portal credentials; passwords are stored encrypted at rest with AES-256-GCM (`public.users.password_encrypted`).
- Preferences define exact weekly lesson slots `(weekday, course, lesson_start_time)` in `public.preferences`.
- Edge Functions (`supabase/functions/`):
  - `gym-login` — verify portal credentials, sync Supabase Auth password, upsert encrypted credentials.
  - `gym-recover` — recover Supabase Auth password after validating gym credentials.
  - `gym-change-password` — change portal password and sync Supabase Auth + DB.
  - `gym-courses` — distinct `CORSI FIT` lesson slots for the next rolling week.
  - `gym-calendar` — `CORSI FIT` classes for current and next month.
  - `gym-mybooks` — active bookings and waitlist positions for the user.
  - `gym-book` — book a seat or join the waitlist.
  - `gym-cancel` — cancel a booking or leave the waitlist.

## Booking Logic

- Scheduled via `.github/workflows/book.yml` (`0,30 4-7 * * *` UTC, gated to `>= 07:00 Europe/Rome`).
- Acquires an atomic per-user daily lock in `public.booking_daily_lock` via `acquire_booking_lock`.
- Evaluates the 20-day booking window (`today` .. `today + 19` in `Europe/Rome`) and matches exact course name + start time on `today + 19`.
- Skips lessons where `IsUserPresent == 1` or `UserPositionWaitingList > 0`.
- Marks the lock `failed` (allowing retry on the next cron tick) if any booking fails or raises an error; marks `completed` otherwise.

## Operational Constraints

- Must prevent duplicate bookings and race conditions across overlapping cron runs.
- External gym API is slow/unreliable and requires `AppToken` + `IYESUrl` headers and cookies.
- Booking window opens in the morning (`Europe/Rome`).

## Future Roadmap

- Migrate the scheduled Python booking job into a Supabase Edge Function (triggered via `pg_cron`/`pg_net` or authenticated webhook) to eliminate Python/Deno client duplication.
- Cache InfoYou `AuthToken` briefly per user to reduce repeated logins.
- Surface `booking_daily_lock` status/errors and opt-in auto-waitlist toggle in the React UI.
