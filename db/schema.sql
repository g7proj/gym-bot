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
    weekday text not null,
    course text not null,
    lesson_start_time time not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, weekday, course, lesson_start_time)
);

create index if not exists idx_users_username on users (username);
create index if not exists idx_preferences_user_id on preferences (user_id);
create index if not exists idx_preferences_weekday on preferences (weekday);
create index if not exists idx_preferences_start_time on preferences (lesson_start_time);
