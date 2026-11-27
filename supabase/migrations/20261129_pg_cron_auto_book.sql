-- Schedule exact 07:01 Europe/Rome daily auto-booking via pg_cron + pg_net + Supabase Vault.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.trigger_gym_auto_book(p_force boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net, pg_temp
as $$
declare
  v_rome_hour integer;
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  -- pg_cron schedules run in UTC ('1 5,6 * * *' covers 07:01 CEST and 07:01 CET).
  -- Only fire the HTTP request during the actual 07:XX hour in Europe/Rome unless forced.
  v_rome_hour := extract(hour from (now() at time zone 'Europe/Rome'))::integer;
  if not p_force and v_rome_hour <> 7 then
    return null;
  end if;

  select decrypted_secret
    into v_url
  from vault.decrypted_secrets
  where name = 'gym_auto_book_url'
  limit 1;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'gym_cron_secret'
  limit 1;

  if coalesce(trim(v_url), '') = '' or coalesce(trim(v_secret), '') = '' then
    raise notice 'Skipping gym-auto-book trigger: Vault secrets gym_auto_book_url / gym_cron_secret are not configured.';
    return null;
  end if;

  select net.http_post(
    url := trim(v_url),
    body := '{"dryRun": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(v_secret)
    ),
    timeout_milliseconds := 60000
  ) into v_request_id;

  return v_request_id;
end;
$$;

-- Restrict execution to database superuser / pg_cron (never expose via PostgREST RPC).
revoke all on function public.trigger_gym_auto_book(boolean) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'gym-auto-book-daily') then
    perform cron.unschedule('gym-auto-book-daily');
  end if;

  -- Runs at 05:01 UTC (07:01 CEST) and 06:01 UTC (07:01 CET); the function filters for 07:XX Europe/Rome.
  perform cron.schedule(
    'gym-auto-book-daily',
    '1 5,6 * * *',
    'select public.trigger_gym_auto_book();'
  );
end;
$$;
