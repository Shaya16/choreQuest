-- =============================================================================
-- Migration 0011: round-rollover cron + new event triggers + push_state CHECK
-- =============================================================================
-- 1. Drops the old notify_round_closed trigger — round-rollover-tick now owns
--    round-close pushes (per-role winner/loser/tied messages).
-- 2. Adds Postgres triggers that fire 'tribute_picked' and 'tribute_paid'
--    events to on-log-inserted when the corresponding columns transition
--    from NULL to non-NULL.
-- 3. Schedules round_rollover_tick every 10 minutes Sun→Mon (covers the
--    Sun 00:00 Asia/Jerusalem boundary even with DST).
-- 4. Extends push_state.trigger_type CHECK constraint to allow the 5 new
--    trigger types.
-- =============================================================================

-- 1. Drop old trigger + function (round-rollover-tick is the new owner)
drop trigger if exists rounds_after_update_notify on public.rounds;
drop function if exists public.notify_round_closed();

-- 2a. Tribute picked trigger (fires when tribute_shop_item_id flips NULL -> not NULL)
create or replace function public.notify_tribute_picked()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  if new.tribute_shop_item_id is not null
     and (old.tribute_shop_item_id is null or old.tribute_shop_item_id <> new.tribute_shop_item_id) then
    select decrypted_secret into base_url from vault.decrypted_secrets
      where name = 'edge_functions_base_url';
    select decrypted_secret into service_key from vault.decrypted_secrets
      where name = 'edge_functions_service_key';
    if base_url is null or service_key is null then return new; end if;
    perform net.http_post(
      url := base_url || '/on-log-inserted',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('type', 'tribute_picked', 'round', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

create trigger rounds_after_update_tribute_picked
  after update of tribute_shop_item_id on public.rounds
  for each row
  execute function public.notify_tribute_picked();

-- 2b. Tribute paid trigger (fires when tribute_paid_at flips NULL -> not NULL)
create or replace function public.notify_tribute_paid()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  if new.tribute_paid_at is not null and old.tribute_paid_at is null then
    select decrypted_secret into base_url from vault.decrypted_secrets
      where name = 'edge_functions_base_url';
    select decrypted_secret into service_key from vault.decrypted_secrets
      where name = 'edge_functions_service_key';
    if base_url is null or service_key is null then return new; end if;
    perform net.http_post(
      url := base_url || '/on-log-inserted',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('type', 'tribute_paid', 'round', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

create trigger rounds_after_update_tribute_paid
  after update of tribute_paid_at on public.rounds
  for each row
  execute function public.notify_tribute_paid();

-- 3. Cron schedule for round-rollover-tick (every 10min Sun → Mon UTC).
--    Sun 00:00 Asia/Jerusalem = Sat 21:00 (winter) / 22:00 (summer) UTC.
--    Polling Sun 00..23 + Mon 00..04 UTC covers both DST regimes safely.
select cron.schedule(
  'round_rollover_tick',
  '*/10 * * * 0,1',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/round-rollover-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_service_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- 4. Extend push_state.trigger_type CHECK to allow the 5 new types.
alter table public.push_state drop constraint if exists push_state_trigger_type_check;
alter table public.push_state
  add constraint push_state_trigger_type_check check (
    trigger_type in (
      'lead_flip',
      'milestone',
      'round_ending',
      'round_closed',
      'end_of_day',
      'inactivity',
      'round_won',
      'round_lost',
      'round_tied',
      'tribute_picked',
      'tribute_paid'
    )
  );
