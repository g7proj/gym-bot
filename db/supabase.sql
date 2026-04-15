-- Supabase schema for gym-bot (Auth + RLS)

create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key,
    username text not null,
    password_encrypted text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.preferences (
    user_id uuid not null references public.users(id) on delete cascade,
    weekday text not null,
    course text not null,
    lesson_start_time time not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, weekday, course, lesson_start_time)
);

-- Per-user daily lock to ensure booking runs once per day.
create table if not exists public.booking_daily_lock (
    user_id uuid not null references public.users(id) on delete cascade,
    run_date date not null,
    status text not null default 'in_progress'
      check (status in ('in_progress', 'completed', 'failed')),
    run_id uuid not null default gen_random_uuid(),
    locked_at timestamptz not null default now(),
    locked_until timestamptz not null default (now() + interval '20 minutes'),
    error text,
    primary key (user_id, run_date)
);

create index if not exists idx_users_id on public.users (id);
create index if not exists idx_preferences_user_id on public.preferences (user_id);
create index if not exists idx_preferences_weekday on public.preferences (weekday);
create index if not exists idx_preferences_start_time on public.preferences (lesson_start_time);
create index if not exists idx_booking_lock_until on public.booking_daily_lock (locked_until);

alter table public.users enable row level security;
alter table public.preferences enable row level security;
alter table public.booking_daily_lock enable row level security;

create policy "Users can manage own profile"
    on public.users
    for all
    using (auth.uid() = id)
    with check (auth.uid() = id);

create policy "Users can manage own preferences"
    on public.preferences
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Atomic lock acquisition for booking runs.
create or replace function public.acquire_booking_lock(
  p_user_id uuid,
  p_run_date date,
  p_ttl interval default interval '20 minutes'
)
returns table(acquired boolean, run_id uuid, status text)
language plpgsql
as $$
declare
  v_run_id uuid;
  v_status text;
begin
  insert into public.booking_daily_lock (user_id, run_date, status, locked_until)
  values (p_user_id, p_run_date, 'in_progress', now() + p_ttl)
  on conflict (user_id, run_date) do nothing
  returning booking_daily_lock.run_id, booking_daily_lock.status
    into v_run_id, v_status;

  if v_run_id is not null then
    return query select true, v_run_id, v_status;
    return;
  end if;

  select booking_daily_lock.run_id, booking_daily_lock.status
    into v_run_id, v_status
  from public.booking_daily_lock
  where user_id = p_user_id and run_date = p_run_date;

  if v_status = 'completed' then
    return query select false, v_run_id, v_status;
    return;
  end if;

  update public.booking_daily_lock
     set status = 'in_progress',
         locked_at = now(),
         locked_until = now() + p_ttl,
         run_id = gen_random_uuid()
   where user_id = p_user_id
     and run_date = p_run_date
     and locked_until < now()
   returning booking_daily_lock.run_id, booking_daily_lock.status
     into v_run_id, v_status;

  if v_run_id is not null then
    return query select true, v_run_id, v_status;
  else
    return query select false, v_run_id, v_status;
  end if;
end $$;
