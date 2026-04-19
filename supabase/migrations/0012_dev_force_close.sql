-- =============================================================================
-- Migration 0012: dev RPC to force-close the active round on demand
-- =============================================================================
-- Lets the user trigger the rollover from the Menu screen without waiting for
-- the Sunday cron tick. Backfills the round's end_date to yesterday and lets
-- the next cron tick close it — keeps the close logic in one place.
--
-- Calls security-defined: invoker must be a player in the couple. RLS on
-- players takes care of the auth check via current_user_couple_id().
-- =============================================================================

create or replace function public.dev_force_close_round()
returns rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_round rounds;
begin
  v_couple_id := public.current_user_couple_id();
  if v_couple_id is null then
    raise exception 'no couple context';
  end if;

  -- Backdate the active round's end_date so the next cron tick closes it.
  update public.rounds
    set end_date = current_date - 1
    where couple_id = v_couple_id and status = 'active'
    returning * into v_round;

  if v_round.id is null then
    raise exception 'no active round';
  end if;

  return v_round;
end;
$$;

grant execute on function public.dev_force_close_round() to authenticated;
