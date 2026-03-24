-- Supabase schema for gym-bot (Auth + RLS)

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
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, weekday, course)
);

create index if not exists idx_users_id on public.users (id);
create index if not exists idx_preferences_user_id on public.preferences (user_id);
create index if not exists idx_preferences_weekday on public.preferences (weekday);

alter table public.users enable row level security;
alter table public.preferences enable row level security;

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
