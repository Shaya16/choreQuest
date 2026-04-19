-- =============================================================================
-- Migration 0015: dev RPC to wipe today's logs for the current couple
-- =============================================================================
-- daily_cap is enforced per Jerusalem-day on logs, independent of rounds. When
-- force-closing rounds intra-day the caps stay depleted because the day
-- boundary hasn't rolled over yet. This RPC lets the builder wipe all of
-- today's logs for their couple (both players) so ammo refills without
-- waiting until tomorrow.
--
-- Returns the number of log rows deleted.
-- =============================================================================

create or replace function public.dev_reset_today_logs()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_start timestamptz;
  v_deleted int;
begin
  v_couple_id := public.current_user_couple_id();
  if v_couple_id is null then
    raise exception 'no couple context';
  end if;

  -- Start of today in Asia/Jerusalem, expressed as a UTC instant.
  v_start := (current_date at time zone 'Asia/Jerusalem');

  with deleted as (
    delete from logs
     where logged_at >= v_start
       and player_id in (
         select id from players where couple_id = v_couple_id
       )
     returning 1
  )
  select count(*) from deleted into v_deleted;

  return v_deleted;
end;
$$;

grant execute on function public.dev_reset_today_logs() to authenticated;
