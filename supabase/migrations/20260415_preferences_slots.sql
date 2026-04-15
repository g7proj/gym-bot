-- Rebuild preferences as exact lesson slots.
-- Existing preference rows can be discarded before applying this migration.

drop table if exists public.preferences cascade;

create table if not exists public.preferences (
    user_id uuid not null references public.users(id) on delete cascade,
    weekday text not null,
    course text not null,
    lesson_start_time time not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, weekday, course, lesson_start_time)
);

create index if not exists idx_preferences_user_id on public.preferences (user_id);
create index if not exists idx_preferences_weekday on public.preferences (weekday);
create index if not exists idx_preferences_start_time on public.preferences (lesson_start_time);

alter table public.preferences enable row level security;

create policy "Users can manage own preferences"
    on public.preferences
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
