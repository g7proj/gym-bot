# Project Context

## Overview
Gym booking automation system:
- React frontend
- Supabase (DB + Auth + Edge Functions)
- External gym API

## Key Concepts
- Users store encrypted gym credentials
- Preferences define desired courses per weekday
- Edge functions:
  - gym-login
  - gym-calendar
  - gym-book
  - gym-cancel
  - gym-courses
  - gym-mybooks

## Booking Logic
- Users select preferred courses
- System checks availability
- Books automatically when possible

## Constraints
- Must avoid duplicate bookings
- External API is unreliable
- Time-sensitive booking (morning window)

## TODO / Ideas
- Improve cron reliability
- Add locking mechanism
- Better error handling