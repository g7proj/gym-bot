-- Telegram deep-link connection state and single-use link tokens for error alerts.

create table if not exists public.telegram_connections (
    user_id uuid primary key references public.users(id) on delete cascade,
    chat_id text not null,
    telegram_username text,
    enabled boolean not null default true,
    last_error_notified_date date,
    connected_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_telegram_connections_chat_id
    on public.telegram_connections (chat_id);

alter table public.telegram_connections enable row level security;

drop policy if exists "Users can view own telegram connection" on public.telegram_connections;
create policy "Users can view own telegram connection"
    on public.telegram_connections
    for select
    using (auth.uid() = user_id);

drop policy if exists "Users can delete own telegram connection" on public.telegram_connections;
create policy "Users can delete own telegram connection"
    on public.telegram_connections
    for delete
    using (auth.uid() = user_id);

-- Short-lived, SHA-256 hashed deep-link tokens (service_role only).
create table if not exists public.telegram_link_tokens (
    token_hash text primary key,
    user_id uuid not null references public.users(id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_telegram_link_tokens_user_id
    on public.telegram_link_tokens (user_id);

create index if not exists idx_telegram_link_tokens_expires_at
    on public.telegram_link_tokens (expires_at);

alter table public.telegram_link_tokens enable row level security;
