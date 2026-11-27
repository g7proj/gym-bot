-- Server-only encrypted cache for short-lived InfoYou session tokens (AuthToken).
create table if not exists public.gym_session_cache (
    user_id uuid primary key references public.users(id) on delete cascade,
    token_encrypted text not null,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create index if not exists idx_gym_session_cache_expires_at
    on public.gym_session_cache (expires_at);

-- Enable RLS with no anon/authenticated policies: accessible exclusively via service_role.
alter table public.gym_session_cache enable row level security;
