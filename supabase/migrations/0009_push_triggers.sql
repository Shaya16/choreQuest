-- =============================================================================
-- Migration 0009: wire pg triggers + pg_cron for push notifications
-- =============================================================================
-- Requires pg_net (for http_post) and pg_cron (for scheduled ticks), both
-- available on Supabase-hosted Postgres.
--
-- Before applying, the deployer must seed two Supabase Vault secrets:
--   insert into vault.secrets (name, secret) values
--     ('edge_functions_base_url', 'https://<project-ref>.supabase.co/functions/v1'),
--     ('edge_functions_service_key', '<service role key>');
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- -----------------------------------------------------------------------------
-- Trigger: on logs INSERT, call on-log-inserted Edge Function with the new row.
-- -----------------------------------------------------------------------------
create or replace function public.notify_log_inserted()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets
    where name = 'edge_functions_base_url';
  select decrypted_secret into service_key from vault.decrypted_secrets
    where name = 'edge_functions_service_key';
  if base_url is null or service_key is null then
    return new;
  end if;
  perform net.http_post(
    url := base_url || '/on-log-inserted',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

create trigger logs_after_insert_notify
  after insert on public.logs
  for each row
  execute function public.notify_log_inserted();

-- -----------------------------------------------------------------------------
-- Trigger: on rounds UPDATE when status flips to 'closed', fire round-closed.
-- -----------------------------------------------------------------------------
create or replace function public.notify_round_closed()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  if new.status = 'closed' and coalesce(old.status, 'active') <> 'closed' then
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
      body := jsonb_build_object('type', 'round_closed', 'round', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

create trigger rounds_after_update_notify
  after update of status on public.rounds
  for each row
  execute function public.notify_round_closed();

-- -----------------------------------------------------------------------------
-- Scheduled job: call notifications-tick Edge Function every 30 minutes.
-- -----------------------------------------------------------------------------
select cron.schedule(
  'notifications_tick',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/notifications-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_service_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
