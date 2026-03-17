-- Postgres schema for gym-bot

create extension if not exists "uuid-ossp";

create table if not exists users (
    id uuid primary key default uuid_generate_v4(),
    username text not null unique,
    password_encrypted text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists preferences (
    user_id uuid not null references users(id) on delete cascade,
    by_day jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id)
);

create index if not exists idx_users_username on users (username);
create index if not exists idx_preferences_by_day on preferences using gin (by_day);
