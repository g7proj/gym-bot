-- Rebuild preferences as exact lesson slots when migrating from the legacy schema.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'preferences'
      and column_name = 'lesson_start_time'
  ) then
    drop table if exists public.preferences cascade;
  end if;
end $$;

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

drop policy if exists "Users can manage own preferences" on public.preferences;

create policy "Users can manage own preferences"
    on public.preferences
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
