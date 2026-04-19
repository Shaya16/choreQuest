-- =============================================================================
-- Migration 0014: dev RPC to inject a log on behalf of the stub partner
-- =============================================================================
-- The stub partner summoned via dev_summon_stub_partner has user_id=NULL, so
-- client-side createLog fails RLS (policies check player.user_id = auth.uid()).
-- This security-definer RPC inserts a log for the stub in the active round of
-- the caller's couple, replicating the minimal coin-computation pipeline so
-- the log row is indistinguishable from a real strike.
-- =============================================================================

create or replace function public.dev_inject_stub_log(p_activity_id uuid)
returns logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_stub_id uuid;
  v_activity activities%rowtype;
  v_round rounds%rowtype;
  v_stub players%rowtype;
  v_coins int;
  v_xp int;
  v_log logs%rowtype;
begin
  v_couple_id := public.current_user_couple_id();
  if v_couple_id is null then
    raise exception 'no couple context';
  end if;

  -- Find the stub (couple member with NULL user_id).
  select * into v_stub
    from players
    where couple_id = v_couple_id and user_id is null
    limit 1;
  if v_stub.id is null then
    raise exception 'no stub partner in this couple — summon one first';
  end if;
  v_stub_id := v_stub.id;

  -- Load the activity.
  select * into v_activity from activities where id = p_activity_id;
  if v_activity.id is null then
    raise exception 'activity % not found', p_activity_id;
  end if;

  -- Resolve the active round for this couple.
  select * into v_round
    from rounds
    where couple_id = v_couple_id and status = 'active'
    order by number desc
    limit 1;
  if v_round.id is null then
    raise exception 'no active round for this couple';
  end if;

  -- Minimal coin/xp math: base_value + bonus × stub's world multiplier.
  -- Matches lib/logger.ts computeLogValues at the v1 level (no crit/daily/etc).
  declare
    v_base int := coalesce(v_activity.base_value, 0) + coalesce(v_activity.bonus, 0);
    v_player_mult numeric;
    v_combo_mult numeric := coalesce(v_stub.combo_multiplier, 1);
  begin
    v_player_mult := case v_activity.world
      when 'gym' then v_stub.mult_gym
      when 'aerobics' then v_stub.mult_aerobics
      when 'university' then v_stub.mult_university
      when 'diet' then v_stub.mult_diet
      when 'household' then v_stub.mult_household
      when 'reading' then v_stub.mult_reading
      else 1
    end;
    v_player_mult := coalesce(v_player_mult, 1);
    v_coins := greatest(0, floor(v_base * v_player_mult * v_combo_mult))::int;
    v_xp := v_base;

    insert into logs (
      player_id, activity_id, round_id,
      base_value, player_multiplier, combo_multiplier,
      crit_multiplier, daily_bonus_multiplier, weekly_hero_multiplier, season_multiplier,
      coins_earned, xp_earned, jackpot_share, personal_share,
      evidence_url, notes
    )
    values (
      v_stub_id, v_activity.id, v_round.id,
      v_base, v_player_mult, v_combo_mult,
      1, 1, 1, 1,
      v_coins, v_xp, 0, v_coins,
      null, null
    )
    returning * into v_log;
  end;

  return v_log;
end;
$$;

grant execute on function public.dev_inject_stub_log(uuid) to authenticated;
