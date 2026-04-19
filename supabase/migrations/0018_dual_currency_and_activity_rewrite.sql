-- =============================================================================
-- Migration 0018: Arsenal dual-currency redesign
-- =============================================================================
-- (1) Adds `activities.round_value` (household-only positive; 0 elsewhere).
-- (2) Adds `activities.archived_at` (soft-delete for cut activities).
-- (3) Adds `logs.round_value_earned` (per-strike snapshot for round-close sum).
-- (4) Extends `rounds.status` CHECK to include 'inactive'.
-- (5) Archives 13 cut activities (preserves FK integrity on existing logs).
-- (6) Rewrites names/descriptions/values for the 44 surviving activities.
-- (7) Replaces dev_inject_stub_log RPC to populate round_value_earned.
-- =============================================================================

-- --- (1)-(3): columns -------------------------------------------------------

alter table public.activities
  add column round_value  integer     not null default 0,
  add column archived_at  timestamptz;

create index activities_not_archived_idx
  on public.activities(world)
  where archived_at is null;

alter table public.logs
  add column round_value_earned integer not null default 0;

-- --- (4): rounds.status ----------------------------------------------------

alter table public.rounds
  drop constraint if exists rounds_status_check;
alter table public.rounds
  add constraint rounds_status_check
  check (status in ('active', 'closed', 'inactive'));

-- --- (5): archive cut activities -------------------------------------------

update public.activities set archived_at = now() where name in (
  'Hit daily macros / calorie target',
  'Hit daily protein target',
  'Hit daily water intake (2L+)',
  'Logged all meals in tracker',
  'No junk food day',
  'Take out recycling',
  'Water all plants',
  'Deep clean bathroom',
  'Deep clean kitchen',
  'Clean windows',
  'Clean inside of fridge',
  'Organize a drawer/cabinet',
  'Reading sprint (15 min / 10 pages)'
);

-- --- (6): rewrite 44 survivors ---------------------------------------------

-- GYM (2)
update public.activities set name='GYM SESSION', description='45+ min', base_value=30, bonus=0, daily_cap=1, round_value=0 where name='Gym session (45+ min)';
update public.activities set name='NEW PR', description='lift', base_value=0, bonus=25, daily_cap=3, round_value=0 where name='New PR (lift)';

-- AEROBICS (3)
update public.activities set name='CARDIO', description='30+ min', base_value=20, bonus=0, daily_cap=1, round_value=0 where name='Aerobics 30+ min';
update public.activities set name='LONG CARDIO', description='60+ min', base_value=40, bonus=0, daily_cap=1, round_value=0 where name='Aerobics 60+ min';
update public.activities set name='CARDIO PR', description='personal best', base_value=0, bonus=25, daily_cap=1, round_value=0 where name='Cardio PR';

-- UNIVERSITY (3)
update public.activities set name='DEEP STUDY', description='90 min · phone away', base_value=25, bonus=0, daily_cap=4, round_value=0 where name='Focused study block (90 min, phone away)';
update public.activities set name='ASSIGNMENT', description='graded · submitted', base_value=80, bonus=0, daily_cap=3, round_value=0 where name='Assignment submitted';
update public.activities set name='EXAM', description=null, base_value=120, bonus=0, daily_cap=2, round_value=0 where name='Exam taken';

-- DIET (6)
update public.activities set name='MEAL PREP', description='full week', base_value=60, bonus=0, daily_cap=1, round_value=0 where name='Meal prep (week)';
update public.activities set name='CLEAN STREAK', description='7 days', base_value=0, bonus=80, daily_cap=1, round_value=0 where name='7-day clean streak';
update public.activities set name='DINNER', description='from scratch', base_value=20, bonus=0, daily_cap=1, round_value=0 where name='Cooked dinner from scratch';
update public.activities set name='LUNCH', description='from scratch', base_value=15, bonus=0, daily_cap=1, round_value=0 where name='Cooked lunch from scratch';
update public.activities set name='NO BOOZE', description='full day', base_value=8, bonus=0, daily_cap=1, round_value=0 where name='No alcohol day';
update public.activities set name='NEW RECIPE', description='healthy', base_value=30, bonus=0, daily_cap=1, round_value=0 where name='New healthy recipe tried';

-- HOUSEHOLD · DAILY (9)
update public.activities set name='DISHES', description='full round', base_value=5, bonus=0, daily_cap=2, round_value=10 where name='Dishes (full round)';
update public.activities set name='TRASH', description=null, base_value=4, bonus=0, daily_cap=1, round_value=8 where name='Take out trash';
update public.activities set name='TIDY ROOM', description='one room', base_value=6, bonus=0, daily_cap=3, round_value=10 where name='Tidy a room';
update public.activities set name='MAKE BED', description=null, base_value=3, bonus=0, daily_cap=1, round_value=5 where name='Make the bed';
update public.activities set name='WIPE COUNTERS', description='kitchen', base_value=4, bonus=0, daily_cap=1, round_value=8 where name='Wipe kitchen counters';
update public.activities set name='QUICK SWEEP', description='one area', base_value=5, bonus=0, daily_cap=2, round_value=10 where name='Sweep / quick vacuum (one area)';
update public.activities set name='DISHWASHER', description='load or unload', base_value=4, bonus=0, daily_cap=2, round_value=8 where name='Dishwasher load or unload';
update public.activities set name='POST-MEAL', description='full cleanup', base_value=5, bonus=0, daily_cap=2, round_value=10 where name='Clean up after a meal';
update public.activities set name='PET + PLANTS', description='feed · water', base_value=5, bonus=0, daily_cap=1, round_value=10 where name='Pet / plant care';

-- HOUSEHOLD · WEEKLY (8)
update public.activities set name='LAUNDRY', description='wash · dry · fold', base_value=15, bonus=0, daily_cap=1, round_value=30 where name='Laundry full cycle';
update public.activities set name='GROCERIES', description='receipt photo', base_value=20, bonus=0, daily_cap=1, round_value=40 where name='Grocery run';
update public.activities set name='BED SHEETS', description='full change', base_value=15, bonus=0, daily_cap=1, round_value=30 where name='Change bed sheets';
update public.activities set name='BATHROOM', description='quick clean', base_value=10, bonus=0, daily_cap=1, round_value=25 where name='Bathroom quick clean';
update public.activities set name='MOP FLOORS', description=null, base_value=12, bonus=0, daily_cap=1, round_value=25 where name='Mop floors';
update public.activities set name='FULL VACUUM', description='whole place', base_value=15, bonus=0, daily_cap=1, round_value=30 where name='Full vacuum (whole place)';
update public.activities set name='FRIDGE', description='interior clean', base_value=12, bonus=0, daily_cap=1, round_value=25 where name='Clean out the fridge';
update public.activities set name='WIPE APPLIANCES', description='stove · microwave', base_value=8, bonus=0, daily_cap=1, round_value=20 where name='Wipe down appliances (stove, microwave)';

-- HOUSEHOLD · MONTHLY (7)
update public.activities set name='DEEP CLEAN', description='one room', base_value=40, bonus=0, daily_cap=2, round_value=100 where name='Deep clean a room';
update public.activities set name='DECLUTTER', description='purge one zone', base_value=60, bonus=0, daily_cap=1, round_value=140 where name='Closet purge / declutter zone';
update public.activities set name='OVEN INSIDE', description='interior scrub', base_value=50, bonus=0, daily_cap=1, round_value=120 where name='Clean inside of oven';
update public.activities set name='WASH BEDDING', description='blankets · duvet', base_value=25, bonus=0, daily_cap=1, round_value=80 where name='Wash bedding (blankets, duvet)';
update public.activities set name='DUST', description='whole place', base_value=20, bonus=0, daily_cap=1, round_value=80 where name='Dust the apartment';
update public.activities set name='FIX SMALL', description='unclog or repair', base_value=30, bonus=0, daily_cap=2, round_value=90 where name='Unclog / fix something small';
update public.activities set name='BUILD PROJECT', description='furniture · DIY', base_value=80, bonus=0, daily_cap=1, round_value=200 where name='Assemble furniture / home project';

-- READING (6)
update public.activities set name='READ', description='30 min · 20 pages', base_value=10, bonus=0, daily_cap=2, round_value=0 where name='Reading session (30 min / 20 pages)';
update public.activities set name='DEEP READ', description='60+ min · 40+ pages', base_value=25, bonus=0, daily_cap=1, round_value=0 where name='Deep read (60+ min / 40+ pages)';
update public.activities set name='FINISHED BOOK', description='cover photo', base_value=0, bonus=80, daily_cap=2, round_value=0 where name='Finished a book';
update public.activities set name='AUDIO LEARN', description='30+ min', base_value=8, bonus=0, daily_cap=2, round_value=0 where name='Audiobook / podcast (30+ min, learning)';
update public.activities set name='PAPER', description='full read', base_value=40, bonus=0, daily_cap=2, round_value=0 where name='Read academic paper (full)';
update public.activities set name='READ NOTES', description='summary', base_value=15, bonus=0, daily_cap=2, round_value=0 where name='Write reading notes / summary';

-- --- (7): replace dev_inject_stub_log to populate round_value_earned -------

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
  v_round_value_earned int;
  v_log logs%rowtype;
begin
  v_couple_id := public.current_user_couple_id();
  if v_couple_id is null then
    raise exception 'no couple context';
  end if;

  select * into v_stub
    from players
    where couple_id = v_couple_id and user_id is null
    limit 1;
  if v_stub.id is null then
    raise exception 'no stub partner in this couple — summon one first';
  end if;
  v_stub_id := v_stub.id;

  select * into v_activity from activities where id = p_activity_id;
  if v_activity.id is null then
    raise exception 'activity % not found', p_activity_id;
  end if;

  select * into v_round
    from rounds
    where couple_id = v_couple_id and status = 'active'
    order by number desc
    limit 1;
  if v_round.id is null then
    raise exception 'no active round for this couple';
  end if;

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
    -- round_value_earned uses the same multipliers as coins.
    -- Non-household activities have round_value = 0 → result is 0.
    v_round_value_earned := greatest(
      0,
      floor(coalesce(v_activity.round_value, 0) * v_player_mult * v_combo_mult)
    )::int;

    insert into logs (
      player_id, activity_id, round_id,
      base_value, player_multiplier, combo_multiplier,
      crit_multiplier, daily_bonus_multiplier, weekly_hero_multiplier, season_multiplier,
      coins_earned, xp_earned, jackpot_share, personal_share,
      round_value_earned,
      evidence_url, notes
    )
    values (
      v_stub_id, v_activity.id, v_round.id,
      v_base, v_player_mult, v_combo_mult,
      1, 1, 1, 1,
      v_coins, v_xp, 0, v_coins,
      v_round_value_earned,
      null, null
    )
    returning * into v_log;
  end;

  return v_log;
end;
$$;

grant execute on function public.dev_inject_stub_log(uuid) to authenticated;
