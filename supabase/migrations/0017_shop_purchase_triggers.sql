-- =============================================================================
-- Migration 0017: pg triggers for shop purchase lifecycle events
-- =============================================================================
-- Fires three event types to the on-log-inserted Edge Function when purchases
-- are created or their status flips into 'redemption_requested' / 'redeemed'.
-- Mirrors the pattern used by the tribute triggers in migration 0011.
-- =============================================================================

-- 1. purchase_made: fires on INSERT.
create or replace function public.notify_purchase_made()
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
  if base_url is null or service_key is null then return new; end if;
  perform net.http_post(
    url := base_url || '/on-log-inserted',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('type', 'purchase_made', 'purchase', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists purchases_after_insert_notify on public.purchases;
create trigger purchases_after_insert_notify
  after insert on public.purchases
  for each row
  execute function public.notify_purchase_made();

-- 2. redemption_requested: fires on status flip pending -> redemption_requested.
create or replace function public.notify_redemption_requested()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  if new.status = 'redemption_requested'
     and coalesce(old.status, 'pending') = 'pending' then
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
      body := jsonb_build_object('type', 'redemption_requested', 'purchase', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_after_update_redemption_requested on public.purchases;
create trigger purchases_after_update_redemption_requested
  after update of status on public.purchases
  for each row
  execute function public.notify_redemption_requested();

-- 3. delivery_confirmed: fires on status flip to redeemed.
create or replace function public.notify_delivery_confirmed()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  if new.status = 'redeemed' and coalesce(old.status, '') <> 'redeemed' then
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
      body := jsonb_build_object('type', 'delivery_confirmed', 'purchase', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_after_update_delivery_confirmed on public.purchases;
create trigger purchases_after_update_delivery_confirmed
  after update of status on public.purchases
  for each row
  execute function public.notify_delivery_confirmed();
