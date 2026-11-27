-- Allow authenticated users to view (read-only) their own daily automated booking runs.
drop policy if exists "Users can view own booking runs" on public.booking_daily_lock;

create policy "Users can view own booking runs"
    on public.booking_daily_lock
    for select
    using (auth.uid() = user_id);
