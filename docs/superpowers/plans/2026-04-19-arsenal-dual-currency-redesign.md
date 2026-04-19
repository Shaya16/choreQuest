# Arsenal Dual-Currency Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship (1) a redesigned Arsenal row with short arcade-style names + qualifier rules, (2) dual-currency scoring where only chores earn round points (shop coins come from every strike), and (3) a 57 → 44 activity rewrite with 13 archived spam-vectors.

**Architecture:** One migration (`0018`) adds two columns to `activities` (`round_value`, `archived_at`) and one to `logs` (`round_value_earned` snapshot), archives 13 activities, rewrites the other 44, and extends `rounds.status` with `'inactive'`. The shared Deno `round-close.ts` module switches from summing `coins_earned` to summing `round_value_earned`, adds a dead-round threshold (<50 chore points → status `'inactive'`, no tribute), and keeps the winner bonus and tribute tier logic. The client `MoveCard` component is simplified (drops slot number, COINS label, redundant `x/y` ammo text, world emoji chip) and adds a dual-payout left rail for chore rows. `StrikeDrawer` swaps `MoveRow` → `MoveCard`. The round-rollover edge function learns to emit `'inactive'` close results without tribute. The round-over route learns an `'inactive'` mode.

**Tech Stack:** Expo SDK 54, React Native 0.81, Supabase (Postgres + Edge Functions), Deno runtime for shared logic, TypeScript.

---

## Spec reference

[`docs/superpowers/specs/2026-04-19-arsenal-dual-currency-redesign.md`](../specs/2026-04-19-arsenal-dual-currency-redesign.md)

---

## Reality notes (for engineers reading this fresh)

- **Working dir** for all commands: `/Users/shayavivi/Desktop/Projects/Chore Quest/chore-quest`.
- **No JS test runner** is installed. Shared Deno modules under `supabase/functions/_shared/` have Deno tests (`deno test supabase/functions/_shared/`). Client-side TypeScript has no runtime tests — verify types via `npx tsc --noEmit` and behavior via manual smoke test.
- **Migration numbering**: highest existing file is `0017_shop_purchase_triggers.sql`. STATE.md confirms `0013` was the last applied live. Files `0014`–`0017` exist locally; pushing `0018` will also push any of `0014`–`0017` that aren't yet live. That is expected and desired — shop migrations should be applied before this one; if they haven't been, run `supabase db push` and let the CLI apply everything in order.
- **Logs store snapshot values.** Every `logs` row has `base_value`, `coins_earned`, `xp_earned`, and per-strike multipliers captured at insert time. This plan adds `round_value_earned` to that family. It defaults to 0, which means pre-migration logs contribute 0 to round score — correct behavior (they predate the dual-currency model).
- **`MoveRow.tsx` is the component getting deleted.** `MoveCard.tsx` already exists unused; we simplify it and route `StrikeDrawer` through it.
- **World accent colors** for dual-payout rail: household is `#2121FF` (blue) per `lib/worlds.ts:50`. Chore round-point numbers render in that accent. Shop coins stay `#FFCC00` yellow.
- **`round-close.ts` handles `skipReason: 'solo_couple'`.** The dead-round branch is a second exit path parallel to that — it returns a structurally-valid CloseResult with `status: 'inactive'`, not a skip marker. The caller (`round-rollover-tick/index.ts`) closes the round with that status but skips the winner/loser/bonus/tribute push flow.
- **The `rounds.status` CHECK** is currently `CHECK (status IN ('active', 'closed'))` per migration 0001. This plan widens it to include `'inactive'`. The client `RoundStatus` type in `lib/types.ts:32` needs a matching update.
- **Mixed-scope migration.** Putting the schema ALTERs, 44-row data rewrite, 13-row archive, and `dev_inject_stub_log` RPC update all in `0018` is deliberate — they MUST ship together or the DB ends up in a state where logs can't be inserted (the RPC would reference a NOT-NULL column with no default). Don't split.

---

## File Structure

**New files:**
- `supabase/migrations/0018_dual_currency_and_activity_rewrite.sql` — all schema + data + RPC changes

**Modified files:**
- `supabase/seed.sql` — mirror the post-migration state for fresh installs
- `lib/types.ts` — extend `Activity`, `Log`, `RoundStatus`
- `lib/logger.ts` — `computeLogValues` adds `round_value_earned`; `loadActivities` filters `archived_at IS NULL`
- `supabase/functions/_shared/round-close.ts` — switch to summing `round_value_earned`; add dead-round threshold; return `status` in result
- `supabase/functions/_shared/round-close.test.ts` — update existing tests to new field name; add 3 new tests (dead-round, mixed worlds, legacy log)
- `supabase/functions/round-rollover-tick/index.ts` — `.select` changes; handle `'inactive'` status; skip winner/loser push for inactive
- `components/game/MoveCard.tsx` — remove slot number, `COINS` label, `x/y` text; add dual-payout rail for chore rows; accept `roundValue` prop
- `components/game/StrikeDrawer.tsx` — `renderMoveRow()` swaps `MoveRow` → `MoveCard`
- `app/(round)/over.tsx` — add `'inactive'` mode (single ACK screen)
- `lib/tribute.ts` — `loadUnresolvedClosedRounds` includes `status IN ('closed', 'inactive')`

**Deleted files:**
- `components/game/MoveRow.tsx` — no consumers after StrikeDrawer swap

---

## Task 1: Write migration 0018 (schema + constraint)

**Files:**
- Create: `supabase/migrations/0018_dual_currency_and_activity_rewrite.sql`

- [ ] **Step 1: Create the migration file with schema changes**

Create `supabase/migrations/0018_dual_currency_and_activity_rewrite.sql`:

```sql
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
```

- [ ] **Step 2: Append the 44-row rewrite to the same migration**

Append to `supabase/migrations/0018_dual_currency_and_activity_rewrite.sql`:

```sql
-- --- (6): rewrite 44 survivors ---------------------------------------------

-- 💪 GYM (2)
update public.activities set name='GYM SESSION', description='45+ min', base_value=30, bonus=0, daily_cap=1, round_value=0 where name='Gym session (45+ min)';
update public.activities set name='NEW PR', description='lift', base_value=0, bonus=25, daily_cap=3, round_value=0 where name='New PR (lift)';

-- 🏃 AEROBICS (3)
update public.activities set name='CARDIO', description='30+ min', base_value=20, bonus=0, daily_cap=1, round_value=0 where name='Aerobics 30+ min';
update public.activities set name='LONG CARDIO', description='60+ min', base_value=40, bonus=0, daily_cap=1, round_value=0 where name='Aerobics 60+ min';
update public.activities set name='CARDIO PR', description='personal best', base_value=0, bonus=25, daily_cap=1, round_value=0 where name='Cardio PR';

-- 🎓 UNIVERSITY (3)
update public.activities set name='DEEP STUDY', description='90 min · phone away', base_value=25, bonus=0, daily_cap=4, round_value=0 where name='Focused study block (90 min, phone away)';
update public.activities set name='ASSIGNMENT', description='graded · submitted', base_value=80, bonus=0, daily_cap=3, round_value=0 where name='Assignment submitted';
update public.activities set name='EXAM', description=null, base_value=120, bonus=0, daily_cap=2, round_value=0 where name='Exam taken';

-- 🥗 DIET (6)
update public.activities set name='MEAL PREP', description='full week', base_value=60, bonus=0, daily_cap=1, round_value=0 where name='Meal prep (week)';
update public.activities set name='CLEAN STREAK', description='7 days', base_value=0, bonus=80, daily_cap=1, round_value=0 where name='7-day clean streak';
update public.activities set name='DINNER', description='from scratch', base_value=20, bonus=0, daily_cap=1, round_value=0 where name='Cooked dinner from scratch';
update public.activities set name='LUNCH', description='from scratch', base_value=15, bonus=0, daily_cap=1, round_value=0 where name='Cooked lunch from scratch';
update public.activities set name='NO BOOZE', description='full day', base_value=8, bonus=0, daily_cap=1, round_value=0 where name='No alcohol day';
update public.activities set name='NEW RECIPE', description='healthy', base_value=30, bonus=0, daily_cap=1, round_value=0 where name='New healthy recipe tried';

-- 🧹 HOUSEHOLD · DAILY (9)
update public.activities set name='DISHES', description='full round', base_value=5, bonus=0, daily_cap=2, round_value=10 where name='Dishes (full round)';
update public.activities set name='TRASH', description=null, base_value=4, bonus=0, daily_cap=1, round_value=8 where name='Take out trash';
update public.activities set name='TIDY ROOM', description='one room', base_value=6, bonus=0, daily_cap=3, round_value=10 where name='Tidy a room';
update public.activities set name='MAKE BED', description=null, base_value=3, bonus=0, daily_cap=1, round_value=5 where name='Make the bed';
update public.activities set name='WIPE COUNTERS', description='kitchen', base_value=4, bonus=0, daily_cap=1, round_value=8 where name='Wipe kitchen counters';
update public.activities set name='QUICK SWEEP', description='one area', base_value=5, bonus=0, daily_cap=2, round_value=10 where name='Sweep / quick vacuum (one area)';
update public.activities set name='DISHWASHER', description='load or unload', base_value=4, bonus=0, daily_cap=2, round_value=8 where name='Dishwasher load or unload';
update public.activities set name='POST-MEAL', description='full cleanup', base_value=5, bonus=0, daily_cap=2, round_value=10 where name='Clean up after a meal';
update public.activities set name='PET + PLANTS', description='feed · water', base_value=5, bonus=0, daily_cap=1, round_value=10 where name='Pet / plant care';

-- 🧹 HOUSEHOLD · WEEKLY (8)
update public.activities set name='LAUNDRY', description='wash · dry · fold', base_value=15, bonus=0, daily_cap=1, round_value=30 where name='Laundry full cycle';
update public.activities set name='GROCERIES', description='receipt photo', base_value=20, bonus=0, daily_cap=1, round_value=40 where name='Grocery run';
update public.activities set name='BED SHEETS', description='full change', base_value=15, bonus=0, daily_cap=1, round_value=30 where name='Change bed sheets';
update public.activities set name='BATHROOM', description='quick clean', base_value=10, bonus=0, daily_cap=1, round_value=25 where name='Bathroom quick clean';
update public.activities set name='MOP FLOORS', description=null, base_value=12, bonus=0, daily_cap=1, round_value=25 where name='Mop floors';
update public.activities set name='FULL VACUUM', description='whole place', base_value=15, bonus=0, daily_cap=1, round_value=30 where name='Full vacuum (whole place)';
update public.activities set name='FRIDGE', description='interior clean', base_value=12, bonus=0, daily_cap=1, round_value=25 where name='Clean out the fridge';
update public.activities set name='WIPE APPLIANCES', description='stove · microwave', base_value=8, bonus=0, daily_cap=1, round_value=20 where name='Wipe down appliances (stove, microwave)';

-- 🧹 HOUSEHOLD · MONTHLY (7)
update public.activities set name='DEEP CLEAN', description='one room', base_value=40, bonus=0, daily_cap=2, round_value=100 where name='Deep clean a room';
update public.activities set name='DECLUTTER', description='purge one zone', base_value=60, bonus=0, daily_cap=1, round_value=140 where name='Closet purge / declutter zone';
update public.activities set name='OVEN INSIDE', description='interior scrub', base_value=50, bonus=0, daily_cap=1, round_value=120 where name='Clean inside of oven';
update public.activities set name='WASH BEDDING', description='blankets · duvet', base_value=25, bonus=0, daily_cap=1, round_value=80 where name='Wash bedding (blankets, duvet)';
update public.activities set name='DUST', description='whole place', base_value=20, bonus=0, daily_cap=1, round_value=80 where name='Dust the apartment';
update public.activities set name='FIX SMALL', description='unclog or repair', base_value=30, bonus=0, daily_cap=2, round_value=90 where name='Unclog / fix something small';
update public.activities set name='BUILD PROJECT', description='furniture · DIY', base_value=80, bonus=0, daily_cap=1, round_value=200 where name='Assemble furniture / home project';

-- 📖 READING (6)
update public.activities set name='READ', description='30 min · 20 pages', base_value=10, bonus=0, daily_cap=2, round_value=0 where name='Reading session (30 min / 20 pages)';
update public.activities set name='DEEP READ', description='60+ min · 40+ pages', base_value=25, bonus=0, daily_cap=1, round_value=0 where name='Deep read (60+ min / 40+ pages)';
update public.activities set name='FINISHED BOOK', description='cover photo', base_value=0, bonus=80, daily_cap=2, round_value=0 where name='Finished a book';
update public.activities set name='AUDIO LEARN', description='30+ min', base_value=8, bonus=0, daily_cap=2, round_value=0 where name='Audiobook / podcast (30+ min, learning)';
update public.activities set name='PAPER', description='full read', base_value=40, bonus=0, daily_cap=2, round_value=0 where name='Read academic paper (full)';
update public.activities set name='READ NOTES', description='summary', base_value=15, bonus=0, daily_cap=2, round_value=0 where name='Write reading notes / summary';
```

- [ ] **Step 3: Append the `dev_inject_stub_log` RPC update to the same migration**

Append to `supabase/migrations/0018_dual_currency_and_activity_rewrite.sql`:

```sql
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
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_dual_currency_and_activity_rewrite.sql
git commit -m "feat(db): migration 0018 for dual-currency activities + logs.round_value_earned"
```

---

## Task 2: Apply migration and verify

**Files:** none created; local DB state changes.

- [ ] **Step 1: Push the migration**

```bash
cd /Users/shayavivi/Desktop/Projects/Chore\ Quest/chore-quest
supabase db push
```

Expected: CLI applies 0018 (and any drafts between 0013 and 0017 that aren't live). Watch output for errors.

- [ ] **Step 2: Verify activity counts**

Run in `psql` or Supabase SQL editor:

```sql
select count(*) from activities where archived_at is null;        -- expect 44
select count(*) from activities where archived_at is not null;    -- expect 13
select count(*) from activities where world = 'household' and round_value > 0 and archived_at is null;  -- expect 24
select count(*) from activities where world != 'household' and round_value = 0 and archived_at is null; -- expect 20
```

Expected: exact counts above. If any diverge, inspect `activities` table rows by world/name and fix the UPDATE statements in 0018.

- [ ] **Step 3: Verify columns exist**

```sql
\d activities
\d logs
\d rounds
```

Expected: `activities` shows `round_value integer not null default 0` and `archived_at timestamptz`. `logs` shows `round_value_earned integer not null default 0`. `rounds` CHECK includes `'inactive'`.

- [ ] **Step 4: Smoke-test the RPC**

```sql
-- Prerequisite: authenticated as a paired user with a stub partner summoned.
-- From the client via Supabase dashboard, find any household activity id:
select id from activities where world = 'household' and archived_at is null limit 1;
-- Invoke the RPC (swap <ACTIVITY_UUID> for the result above):
select * from dev_inject_stub_log('<ACTIVITY_UUID>');
```

Expected: new logs row with `round_value_earned > 0` (household activity).

Repeat for a non-household activity (e.g., `GYM SESSION`); expect `round_value_earned = 0`.

---

## Task 3: Update `seed.sql` to mirror post-migration state

**Files:**
- Modify: `supabase/seed.sql` (lines 1–117)

Rewrite the file so fresh installs land in the new state. The file has three sections: activities, shop items, (no per-couple defaults). Only the activities section changes.

- [ ] **Step 1: Replace the activities section**

Open `supabase/seed.sql` and replace lines 14–93 (all 57 INSERT statements across gym / aerobics / university / diet / household daily / household weekly / household monthly / reading) with the 44-row equivalent matching Task 1's new names + descriptions + values + `round_value`. The INSERT column list becomes:

```sql
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
```

Example for the gym section:

```sql
-- 💪 GYM (2)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('gym', NULL, 'GYM SESSION', '45+ min', 30, 0, 1, false, 0),
  ('gym', NULL, 'NEW PR', 'lift', 0, 25, 3, true, 0);
```

Continue for all 6 worlds and household tiers. Every household row has `round_value > 0`; every other world has `round_value = 0`. For activities with no qualifier (TRASH, EXAM, MAKE BED, MOP FLOORS), use `''` (empty string) — NOT `NULL` — for `description`, matching the client's expectation of a non-null string. Correction: the `Activity.description` type is `string | null`, and the migration sets `description = null` for no-qualifier rows, so the seed should match: use `NULL`.

Do NOT seed the 13 archived activities — they simply don't exist in fresh installs.

- [ ] **Step 2: Verify by diff**

```bash
git diff supabase/seed.sql
```

Confirm: 44 INSERT VALUES rows in the activities section, all with 9 column values (including `round_value`).

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(seed): align seed.sql with migration 0018 (44 activities, round_value column)"
```

---

## Task 4: Update `lib/types.ts`

**Files:**
- Modify: `lib/types.ts:32` (`RoundStatus`), `:82-96` (`Activity`), `:121-140` (`Log`)

- [ ] **Step 1: Extend `RoundStatus`**

Replace line 32:

```ts
export type RoundStatus = 'active' | 'closed' | 'inactive';
```

- [ ] **Step 2: Extend `Activity`**

Replace the `Activity` type (lines 82–96) with:

```ts
export type Activity = {
  id: string;
  world: World;
  tier: HouseholdTier | null;
  name: string;
  description: string | null;
  base_value: number;
  bonus: number;
  daily_cap: number;
  requires_photo: boolean;
  icon_sprite: string | null;
  is_custom: boolean;
  created_by_couple_id: string | null;
  is_active: boolean;
  round_value: number;
  archived_at: string | null;
};
```

- [ ] **Step 3: Extend `Log`**

Replace the `Log` type (lines 121–140) with:

```ts
export type Log = {
  id: string;
  player_id: string;
  activity_id: string;
  round_id: string;
  base_value: number;
  player_multiplier: number;
  combo_multiplier: number;
  crit_multiplier: number;
  daily_bonus_multiplier: number;
  weekly_hero_multiplier: number;
  season_multiplier: number;
  coins_earned: number;
  xp_earned: number;
  jackpot_share: number;
  personal_share: number;
  round_value_earned: number;
  evidence_url: string | null;
  notes: string | null;
  logged_at: string;
};
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

Expected: exit 0. If there are errors, they will point to call sites that read `log.round_value_earned` or `activity.round_value` without the type being extended — those get fixed in later tasks, so errors here should be unrelated.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add Activity.round_value, Activity.archived_at, Log.round_value_earned, RoundStatus inactive"
```

---

## Task 5: Update `round-close.ts` to sum `round_value_earned` (TDD)

**Files:**
- Modify: `supabase/functions/_shared/round-close.ts`
- Modify: `supabase/functions/_shared/round-close.test.ts`

- [ ] **Step 1: Update the existing test file to use new field**

Open `supabase/functions/_shared/round-close.test.ts`. Replace the `mkLog` helper and every `Deno.test` block that uses it to pass `round_value_earned` instead of `coins_earned`. Since chore round totals used to equal coin totals in the old tests (all activities contributed to round score), the existing assertions stay correct after the rename. New file content:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCloseResult, type LogForClose } from './round-close.ts';

const mkLog = (player_id: string, roundPts: number, world: string): LogForClose => ({
  player_id,
  round_value_earned: roundPts,
  world,
});

Deno.test('p1 wins by 87 → knockout, +21 bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'household'),
      mkLog('p1', 50, 'household'),
      mkLog('p2', 63, 'household'),
    ],
  });
  assertEquals(result.status, 'closed');
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.p1Total, 150);
  assertEquals(result.p2Total, 63);
  assertEquals(result.margin, 87);
  assertEquals(result.tributeTier, 'knockout');
  assertEquals(result.winnerBonusCoins, 21);
});

Deno.test('p2 wins → roles swap', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 100, 'household'), mkLog('p2', 200, 'household')],
  });
  assertEquals(result.winnerId, 'p2');
  assertEquals(result.loserId, 'p1');
  assertEquals(result.margin, 100);
});

Deno.test('tied above threshold → no winner, no tribute, no bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 60, 'household'), mkLog('p2', 60, 'household')],
  });
  assertEquals(result.status, 'closed');
  assertEquals(result.winnerId, null);
  assertEquals(result.loserId, null);
  assertEquals(result.margin, 0);
  assertEquals(result.tributeTier, null);
  assertEquals(result.winnerBonusCoins, 0);
});

Deno.test('loser logged 0 → flawless override regardless of margin', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 80, 'household')],
  });
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.margin, 80);
  assertEquals(result.tributeTier, 'flawless');
});

Deno.test('winner takes 5+ of 6 worlds → flawless override (non-household counts for crowns)', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 0, 'gym'),            // non-chore: 0 round pts, but still logs a world
      mkLog('p1', 0, 'aerobics'),
      mkLog('p1', 0, 'university'),
      mkLog('p1', 0, 'diet'),
      mkLog('p1', 60, 'household'),     // wins household on a chore
      mkLog('p2', 0, 'reading'),
    ],
  });
  assertEquals(result.tributeTier, 'flawless');
});

Deno.test('winner bonus coin cap at 500', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 5000, 'household'), mkLog('p2', 100, 'household')],
  });
  assertEquals(result.margin, 4900);
  assertEquals(result.winnerBonusCoins, 500);
});

Deno.test('null p2Id (solo couple) → returns no-close marker', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: null,
    logs: [mkLog('p1', 100, 'household')],
  });
  assertEquals(result.skipReason, 'solo_couple');
});

Deno.test('crowns_json reflects per-world winner using round pts', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'household'),
      mkLog('p2', 50, 'household'),
    ],
  });
  assertEquals(result.crownsJson, { household: 'p1' });
});

// --- NEW tests for dual-currency + dead-round ------------------------------

Deno.test('both below dead-round threshold → status inactive, no tribute', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 30, 'household'), mkLog('p2', 40, 'household')],
  });
  assertEquals(result.status, 'inactive');
  assertEquals(result.winnerId, null);
  assertEquals(result.loserId, null);
  assertEquals(result.tributeTier, null);
  assertEquals(result.winnerBonusCoins, 0);
});

Deno.test('one above, one below threshold → round still closes', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 60, 'household'), mkLog('p2', 30, 'household')],
  });
  assertEquals(result.status, 'closed');
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.margin, 30);
  assertEquals(result.tributeTier, 'paper_cut');
});

Deno.test('non-chore logs sum to 0 round score', () => {
  // 10 gym sessions at 0 round_value_earned + 1 DISHES at 10 = round total 10
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 0, 'gym'),
      mkLog('p1', 0, 'gym'),
      mkLog('p1', 0, 'gym'),
      mkLog('p1', 10, 'household'),
      mkLog('p2', 80, 'household'),
    ],
  });
  assertEquals(result.status, 'closed');
  assertEquals(result.p1Total, 10);
  assertEquals(result.p2Total, 80);
  assertEquals(result.winnerId, 'p2');
});

Deno.test('legacy pre-migration logs contribute 0 to round score', () => {
  // Simulates a pre-migration log where round_value_earned defaulted to 0
  // even though the underlying activity is a chore.
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 0, 'household'),  // legacy chore log — pre-migration
      mkLog('p1', 60, 'household'), // post-migration chore log
      mkLog('p2', 50, 'household'),
    ],
  });
  assertEquals(result.p1Total, 60);
  assertEquals(result.p2Total, 50);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/shayavivi/Desktop/Projects/Chore\ Quest/chore-quest
deno test supabase/functions/_shared/round-close.test.ts
```

Expected: compile error or test failures. Error points to `round_value_earned` not being in `LogForClose` and `result.status` not existing on `CloseResult`.

- [ ] **Step 3: Update `round-close.ts` to match**

Replace the entire content of `supabase/functions/_shared/round-close.ts` with:

```ts
import {
  tierForMargin,
  tierForFlawlessOverride,
  type TributeTier,
} from './tribute-tiers.ts';

export type LogForClose = {
  player_id: string;
  round_value_earned: number;
  world: string;
};

export type CloseStatus = 'closed' | 'inactive';

export type CloseResult =
  | {
      skipReason: 'solo_couple';
      status?: never;
      p1Total?: never;
      p2Total?: never;
      winnerId?: never;
      loserId?: never;
      margin?: never;
      tributeTier?: never;
      winnerBonusCoins?: never;
      crownsJson?: never;
    }
  | {
      skipReason?: never;
      status: CloseStatus;
      p1Total: number;
      p2Total: number;
      winnerId: string | null;
      loserId: string | null;
      margin: number;
      tributeTier: TributeTier | null;
      winnerBonusCoins: number;
      crownsJson: Record<string, string>;
    };

const BONUS_RATE = 0.25;
const BONUS_CAP = 500;
const DEAD_ROUND_THRESHOLD = 50;

export function computeCloseResult(input: {
  p1Id: string;
  p2Id: string | null;
  logs: LogForClose[];
}): CloseResult {
  if (!input.p2Id) return { skipReason: 'solo_couple' };

  let p1Total = 0;
  let p2Total = 0;
  for (const l of input.logs) {
    if (l.player_id === input.p1Id) p1Total += l.round_value_earned ?? 0;
    else if (l.player_id === input.p2Id) p2Total += l.round_value_earned ?? 0;
  }

  // Crowns: per-world winner by round points. Worlds with 0-0 score award no crown.
  const worldScores = new Map<string, { p1: number; p2: number }>();
  for (const l of input.logs) {
    const ws = worldScores.get(l.world) ?? { p1: 0, p2: 0 };
    if (l.player_id === input.p1Id) ws.p1 += l.round_value_earned ?? 0;
    else if (l.player_id === input.p2Id) ws.p2 += l.round_value_earned ?? 0;
    worldScores.set(l.world, ws);
  }
  const crownsJson: Record<string, string> = {};
  let p1WorldCount = 0;
  let p2WorldCount = 0;
  for (const [world, scores] of worldScores) {
    if (scores.p1 > scores.p2) {
      crownsJson[world] = input.p1Id;
      p1WorldCount++;
    } else if (scores.p2 > scores.p1) {
      crownsJson[world] = input.p2Id;
      p2WorldCount++;
    }
  }

  // Dead-round check: if neither player cleared the threshold, close INACTIVE.
  if (Math.max(p1Total, p2Total) < DEAD_ROUND_THRESHOLD) {
    return {
      status: 'inactive',
      p1Total,
      p2Total,
      winnerId: null,
      loserId: null,
      margin: 0,
      tributeTier: null,
      winnerBonusCoins: 0,
      crownsJson,
    };
  }

  const margin = Math.abs(p1Total - p2Total);
  let winnerId: string | null = null;
  let loserId: string | null = null;
  let winnerLogCount = 0;
  let loserLogCount = 0;
  let winnerWorldCount = 0;

  if (p1Total > p2Total) {
    winnerId = input.p1Id;
    loserId = input.p2Id;
    winnerWorldCount = p1WorldCount;
  } else if (p2Total > p1Total) {
    winnerId = input.p2Id;
    loserId = input.p1Id;
    winnerWorldCount = p2WorldCount;
  }

  if (winnerId) {
    for (const l of input.logs) {
      if (l.player_id === winnerId) winnerLogCount++;
      else if (l.player_id === loserId) loserLogCount++;
    }
  }

  let tributeTier: TributeTier | null = null;
  if (winnerId) {
    tributeTier =
      tierForFlawlessOverride({
        loserLogCount,
        winnerWorldCount,
        totalContestedWorlds: worldScores.size,
      }) ?? tierForMargin(margin);
  }

  const winnerBonusCoins = winnerId
    ? Math.min(Math.floor(margin * BONUS_RATE), BONUS_CAP)
    : 0;

  return {
    status: 'closed',
    p1Total,
    p2Total,
    winnerId,
    loserId,
    margin,
    tributeTier,
    winnerBonusCoins,
    crownsJson,
  };
}
```

- [ ] **Step 4: Run tests and verify pass**

```bash
deno test supabase/functions/_shared/round-close.test.ts
```

Expected: all 12 tests pass.

- [ ] **Step 5: Run full Deno test suite**

```bash
deno test supabase/functions/_shared/
```

Expected: all tests in the `_shared` directory still pass. `tribute-tiers.test.ts`, `quiet-hours.test.ts`, `variant-picker.test.ts` are unchanged by this plan and should stay green.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/round-close.ts supabase/functions/_shared/round-close.test.ts
git commit -m "feat(round-close): sum round_value_earned + dead-round threshold + status field"
```

---

## Task 6: Update `lib/logger.ts` for round_value_earned + archived filter

**Files:**
- Modify: `lib/logger.ts:24-36` (`ComputedLogValues` type + `computeLogValues`)
- Modify: `lib/logger.ts:43-82` (`computeLogValues` body)
- Modify: `lib/logger.ts:113-122` (`loadActivities`)

- [ ] **Step 1: Extend `ComputedLogValues` type**

In `lib/logger.ts`, replace lines 24–36 with:

```ts
export type ComputedLogValues = {
  base_value: number;
  player_multiplier: number;
  combo_multiplier: number;
  crit_multiplier: number;
  daily_bonus_multiplier: number;
  weekly_hero_multiplier: number;
  season_multiplier: number;
  coins_earned: number;
  xp_earned: number;
  jackpot_share: number;
  personal_share: number;
  round_value_earned: number;
};
```

- [ ] **Step 2: Compute `round_value_earned` in `computeLogValues`**

Replace `computeLogValues` (lines 43–82) with:

```ts
export function computeLogValues(
  activity: Activity,
  player: Player
): ComputedLogValues {
  const rawBase = (activity.base_value ?? 0) + (activity.bonus ?? 0);
  const mk = WORLD_META[activity.world].multKey;
  const playerMult = Number(player[mk] ?? 1) || 1;
  const comboMult = player.combo_multiplier ?? 1;
  const critMult = 1;
  const dailyBonusMult = 1;
  const weeklyHeroMult = 1;
  const seasonMult = 1;

  const multTotal =
    playerMult * comboMult * critMult * dailyBonusMult * weeklyHeroMult * seasonMult;

  const coins = Math.max(0, Math.floor(rawBase * multTotal));
  const roundValue = Math.max(
    0,
    Math.floor((activity.round_value ?? 0) * multTotal)
  );

  return {
    base_value: rawBase,
    player_multiplier: playerMult,
    combo_multiplier: comboMult,
    crit_multiplier: critMult,
    daily_bonus_multiplier: dailyBonusMult,
    weekly_hero_multiplier: weeklyHeroMult,
    season_multiplier: seasonMult,
    coins_earned: coins,
    xp_earned: rawBase,
    jackpot_share: 0,
    personal_share: coins,
    round_value_earned: roundValue,
  };
}
```

- [ ] **Step 3: Filter archived activities in `loadActivities`**

Replace `loadActivities` (lines 113–122) with:

```ts
export async function loadActivities(): Promise<Activity[]> {
  const { data } = await supabase
    .from('activities')
    .select('*')
    .eq('is_active', true)
    .is('archived_at', null)
    .order('world', { ascending: true })
    .order('tier', { ascending: true, nullsFirst: true })
    .order('base_value', { ascending: false });
  return (data ?? []) as Activity[];
}
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

Expected: exit 0. The `createLog` call on line 92–99 spreads `...values` into the insert, which now includes `round_value_earned` — this flows through correctly because `Log.Insert` in `types.ts:242` is `Omit<Log, 'id'|'logged_at'>` and `Log` now contains `round_value_earned`.

- [ ] **Step 5: Commit**

```bash
git add lib/logger.ts
git commit -m "feat(logger): compute round_value_earned per strike + filter archived activities"
```

---

## Task 7: Update `round-rollover-tick` edge function

**Files:**
- Modify: `supabase/functions/round-rollover-tick/index.ts:86-101` (logs query + mapping)
- Modify: `supabase/functions/round-rollover-tick/index.ts:115-130` (round update)
- Modify: `supabase/functions/round-rollover-tick/index.ts:140-146` (push flow — skip inactive)

- [ ] **Step 1: Update the logs select and LogForClose mapping**

Replace lines 86–101 with:

```ts
  const { data: rawLogs } = await admin
    .from('logs')
    .select('player_id, round_value_earned, activities(world)')
    .eq('round_id', round.id);

  const logs: LogForClose[] = (rawLogs ?? []).map((r: {
    player_id: string;
    round_value_earned: number | null;
    activities: { world: string } | { world: string }[] | null;
  }) => ({
    player_id: r.player_id,
    round_value_earned: r.round_value_earned ?? 0,
    world: Array.isArray(r.activities)
      ? r.activities[0]?.world ?? 'unknown'
      : r.activities?.world ?? 'unknown',
  }));
```

- [ ] **Step 2: Use `result.status` when updating the round**

Replace lines 115–130 (the `.from('rounds').update(...)` block) with:

```ts
  const { data: updated } = await admin
    .from('rounds')
    .update({
      status: result.status,              // 'closed' or 'inactive'
      p1_total: result.p1Total,
      p2_total: result.p2Total,
      winner_id: result.winnerId,
      loser_id: result.loserId,
      margin: result.margin,
      tribute_tier: result.tributeTier,
      winner_bonus_coins: result.winnerBonusCoins,
      crowns_json: result.crownsJson,
    })
    .eq('id', round.id)
    .eq('status', 'active')
    .select('*');
```

- [ ] **Step 3: Skip the winner/loser push for inactive rounds, send inactive push instead**

Replace lines 140–146 (the `if (!isQuietHours())` block) with:

```ts
  if (result.status === 'inactive') {
    if (!isQuietHours()) {
      await pushRoundInactive(admin, p1, p2, round);
    }
  } else if (!isQuietHours()) {
    await pushRoundOutcome(admin, p1, p2, result, round);
  }
```

- [ ] **Step 4: Add the `pushRoundInactive` helper**

At the bottom of `supabase/functions/round-rollover-tick/index.ts`, add (after `writeLastIndex`):

```ts
async function pushRoundInactive(
  admin: SupabaseClient,
  p1: PlayerRow,
  p2: PlayerRow | null,
  round: RoundRow
): Promise<void> {
  const message = `ROUND ${round.number} INACTIVE — nobody hit 50 chore points. No tribute this week.`;
  for (const player of [p1, p2].filter((p): p is PlayerRow => !!p)) {
    if (!player.expo_push_token) continue;
    await sendPush({
      to: player.expo_push_token,
      title: 'ROUND INACTIVE',
      body: message,
      data: { screen: 'round_over', round_id: round.id },
    });
  }
}
```

- [ ] **Step 5: Narrow the `pushRoundOutcome` type signature**

On line 170, the parameter `result` is typed as `Exclude<ReturnType<typeof computeCloseResult>, { skipReason: 'solo_couple' }>`. That type now includes `status: 'closed' | 'inactive'`. Since the call site only invokes `pushRoundOutcome` in the `else` branch (i.e., when status is `'closed'`), the function body is safe. No signature change required. But if `npx tsc --noEmit` complains, tighten via:

```ts
result: Extract<ReturnType<typeof computeCloseResult>, { status: 'closed' }>
```

- [ ] **Step 6: Deploy the edge function**

```bash
cd /Users/shayavivi/Desktop/Projects/Chore\ Quest/chore-quest
supabase functions deploy round-rollover-tick --project-ref <your-project-ref>
```

(Project ref is in `.env.local` under `EXPO_PUBLIC_SUPABASE_URL` — the subdomain is the ref.)

Expected: deploy succeeds. If running from a worktree, first run `supabase link --project-ref <ref>` per the gotcha in STATE.md.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/round-rollover-tick/index.ts
git commit -m "feat(rollover): select round_value_earned + inactive-status round handling"
```

---

## Task 8: Simplify `MoveCard.tsx` (remove slot/COINS/x-of-y/chip; add dual-payout rail)

**Files:**
- Modify: `components/game/MoveCard.tsx`

This is a content change to an existing component. No unit tests in the project — verify via `npx tsc --noEmit` and manual smoke.

- [ ] **Step 1: Rewrite `MoveCard.tsx`**

Replace the entire file content of `components/game/MoveCard.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';

import type { Activity } from '@/lib/types';

type Props = {
  activity: Activity;
  usesLeft: number;
  dailyCap: number;
  accentHex: string;
  onStrike: () => void;
  strikeFlashKey: number;
};

/**
 * Arsenal move card. Left rail shows payout(s), content column shows the
 * move name + qualifier + optional badges, right rail shows ammo pips.
 * Chore rows (household, round_value > 0) show two stacked numbers on the
 * left rail: round points in world accent (top) and shop coins in yellow
 * (bottom). Non-chore rows show a single centered shop-coin number.
 */
export function MoveCard({
  activity,
  usesLeft,
  dailyCap,
  accentHex,
  onStrike,
  strikeFlashKey,
}: Props) {
  const depleted = usesLeft <= 0;
  const shopCoins = (activity.base_value ?? 0) + (activity.bonus ?? 0);
  const roundPts = activity.round_value ?? 0;
  const isChore = roundPts > 0;
  const isBonusMove = (activity.bonus ?? 0) > 0;

  const [flashDamage, setFlashDamage] = useState<number | null>(null);
  const lastKey = useRef(strikeFlashKey);

  useEffect(() => {
    if (strikeFlashKey !== lastKey.current) {
      lastKey.current = strikeFlashKey;
      setFlashDamage(shopCoins);
      const t = setTimeout(() => setFlashDamage(null), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [strikeFlashKey, shopCoins]);

  return (
    <Pressable
      onPress={depleted ? undefined : onStrike}
      style={{ marginBottom: 8 }}
    >
      {({ pressed }) => (
        <View style={{ position: 'relative' }}>
          {!pressed && !depleted && (
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                right: -4,
                bottom: -4,
                backgroundColor: '#000000',
              }}
            />
          )}

          <MotiView
            key={`hit-${strikeFlashKey}`}
            from={{ scale: 1 }}
            animate={{ scale: strikeFlashKey > 0 ? [1, 1.04, 1] : 1 }}
            transition={{ type: 'timing', duration: 260 }}
            style={{
              transform: [
                { translateX: pressed && !depleted ? 4 : 0 },
                { translateY: pressed && !depleted ? 4 : 0 },
              ],
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: depleted ? '#111111' : '#000000',
                borderWidth: 3,
                borderColor: depleted ? '#4A4A4A' : accentHex,
                opacity: depleted ? 0.45 : 1,
                minHeight: 72,
              }}
            >
              {/* Left rail: payout(s) */}
              <View
                style={{
                  width: 56,
                  borderRightWidth: 2,
                  borderRightColor: depleted ? '#4A4A4A' : accentHex,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 4,
                  backgroundColor: depleted ? '#0a0a0a' : 'rgba(0,0,0,0.6)',
                }}
              >
                {isChore ? (
                  <>
                    <Text
                      style={{
                        fontFamily: 'PressStart2P',
                        color: depleted ? '#4A4A4A' : accentHex,
                        fontSize: 16,
                      }}
                    >
                      +{roundPts}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'PressStart2P',
                        color: depleted ? '#4A4A4A' : '#FFCC00',
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      +{shopCoins}
                    </Text>
                  </>
                ) : (
                  <Text
                    style={{
                      fontFamily: 'PressStart2P',
                      color: depleted ? '#4A4A4A' : '#FFCC00',
                      fontSize: 18,
                    }}
                  >
                    +{shopCoins}
                  </Text>
                )}
              </View>

              {/* Content: name + qualifier + badges */}
              <View
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: depleted ? '#4A4A4A' : '#FFFFFF',
                    fontSize: 10,
                    lineHeight: 14,
                  }}
                  numberOfLines={2}
                >
                  {activity.name}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Silkscreen',
                    color: depleted ? '#4A4A4A' : '#8A8A8A',
                    fontSize: 9,
                    letterSpacing: 1,
                    marginTop: 3,
                    minHeight: 11, // reserve space even when empty for uniform rhythm
                  }}
                  numberOfLines={1}
                >
                  {activity.description ?? ''}
                </Text>
                {(isBonusMove || activity.requires_photo || activity.tier) && (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      marginTop: 4,
                      gap: 4,
                    }}
                  >
                    {isBonusMove && (
                      <Badge label="★ BONUS" color="#FFCC00" dim={depleted} />
                    )}
                    {activity.requires_photo && (
                      <Badge label="📷 PHOTO" color="#00DDFF" dim={depleted} />
                    )}
                    {activity.tier && (
                      <Badge
                        label={activity.tier.toUpperCase()}
                        color="#FFB8DE"
                        dim={depleted}
                      />
                    )}
                  </View>
                )}
              </View>

              {/* Right rail: ammo pips */}
              <View
                style={{
                  width: 52,
                  borderLeftWidth: 2,
                  borderLeftColor: depleted ? '#4A4A4A' : accentHex,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 4,
                  backgroundColor: depleted ? '#0a0a0a' : 'rgba(0,0,0,0.6)',
                }}
              >
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {Array.from({ length: dailyCap }).map((_, i) => {
                    const filled = i < usesLeft;
                    return (
                      <View
                        key={i}
                        style={{
                          width: 8,
                          height: 12,
                          backgroundColor: filled
                            ? depleted
                              ? '#4A4A4A'
                              : accentHex
                            : '#000000',
                          borderWidth: 1,
                          borderColor: depleted ? '#4A4A4A' : accentHex,
                        }}
                      />
                    );
                  })}
                </View>
              </View>

              {depleted && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      borderWidth: 2,
                      borderColor: '#FF3333',
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      transform: [{ rotate: '-8deg' }],
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'PressStart2P',
                        color: '#FF3333',
                        fontSize: 10,
                        letterSpacing: 2,
                      }}
                    >
                      DEPLETED
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {flashDamage != null && (
              <MotiView
                key={`dmg-${strikeFlashKey}`}
                from={{ translateY: 0, opacity: 1, scale: 0.8 }}
                animate={{ translateY: -40, opacity: 0, scale: 1.6 }}
                transition={{ type: 'timing', duration: 900 }}
                style={{
                  position: 'absolute',
                  top: 20,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                  zIndex: 10,
                }}
                pointerEvents="none"
              >
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: '#FFCC00',
                    fontSize: 18,
                    textShadowColor: '#FF3333',
                    textShadowOffset: { width: 2, height: 2 },
                    textShadowRadius: 0,
                  }}
                >
                  +{flashDamage}
                </Text>
              </MotiView>
            )}
          </MotiView>
        </View>
      )}
    </Pressable>
  );
}

function Badge({
  label,
  color,
  dim,
}: {
  label: string;
  color: string;
  dim: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: dim ? '#4A4A4A' : color,
        paddingHorizontal: 4,
        paddingVertical: 1,
      }}
    >
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: dim ? '#4A4A4A' : color,
          fontSize: 7,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/game/MoveCard.tsx
git commit -m "feat(move-card): simplify + dual-payout rail for chore rows"
```

---

## Task 9: Swap `StrikeDrawer` to render `MoveCard` and delete `MoveRow`

**Files:**
- Modify: `components/game/StrikeDrawer.tsx:602-620` (`renderMoveRow` function)
- Modify: `components/game/StrikeDrawer.tsx:5` (import)
- Delete: `components/game/MoveRow.tsx`

- [ ] **Step 1: Update import in `StrikeDrawer.tsx`**

Line 5:

```tsx
import { MoveCard } from './MoveCard';
```

(Replace the existing `import { MoveRow } from './MoveRow';` line.)

- [ ] **Step 2: Update `renderMoveRow` to use `MoveCard`**

Replace the `renderMoveRow` function (lines 602–620) with:

```tsx
function renderMoveRow(
  a: Activity,
  todayCounts: Record<string, number>,
  strikeFlashMap: Record<string, number>,
  onStrike: (activity: Activity) => void
) {
  const used = todayCounts[a.id] ?? 0;
  const usesLeft = Math.max(0, (a.daily_cap ?? 0) - used);
  return (
    <MoveCard
      key={a.id}
      activity={a}
      usesLeft={usesLeft}
      dailyCap={a.daily_cap ?? 1}
      accentHex={WORLD_META[a.world].accentHex}
      onStrike={() => onStrike(a)}
      strikeFlashKey={strikeFlashMap[a.id] ?? 0}
    />
  );
}
```

- [ ] **Step 3: Delete `components/game/MoveRow.tsx`**

```bash
rm components/game/MoveRow.tsx
```

- [ ] **Step 4: Verify no remaining consumers**

```bash
grep -rn "MoveRow" components/ app/ lib/
```

Expected: no matches.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/game/StrikeDrawer.tsx components/game/MoveRow.tsx
git commit -m "feat(arsenal): swap MoveRow → MoveCard in StrikeDrawer + delete MoveRow"
```

---

## Task 10: Update `app/(round)/over.tsx` for inactive mode

**Files:**
- Modify: `app/(round)/over.tsx`
- (Cross-reference) `lib/tribute.ts` `loadUnresolvedClosedRounds`

- [ ] **Step 1: Verify `loadUnresolvedClosedRounds` includes inactive rounds**

Open `lib/tribute.ts`. Find `loadUnresolvedClosedRounds`. If it currently filters `.eq('status', 'closed')`, change to:

```ts
.in('status', ['closed', 'inactive'])
```

Also look for any downstream logic that assumes `status === 'closed'` once loaded. The tribute flow only applies to closed rounds; inactive rounds should short-circuit before tribute card rendering.

- [ ] **Step 2: Add `'inactive'` mode to `over.tsx`**

Open `app/(round)/over.tsx`. Find the mode-state-machine (the `switch` / conditional that branches on modes like `cinematic` / `pick` / `await` / `collect` / `acknowledge` / `tied`). Add an `'inactive'` case that selects when `round.status === 'inactive'`.

The `'inactive'` UI is minimal:

```tsx
// Pseudo-structure — match the file's existing layout patterns:
// (1) full-screen black background with pixel-font header "ROUND INACTIVE"
// (2) subtitle "Nobody hit 50 chore points this week"
// (3) muted body explaining no tribute this round
// (4) single ACK button that dismisses and moves to the next unresolved round
//     (or returns home if none)
```

Concrete JSX to slot into the existing mode-switch, matching the project's PressStart2P / dark-arcade aesthetic:

```tsx
{mode === 'inactive' && (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000000' }}>
    <Text style={{ fontFamily: 'PressStart2P', color: '#FFCC00', fontSize: 18, letterSpacing: 2, textAlign: 'center' }}>
      ROUND INACTIVE
    </Text>
    <Text style={{ fontFamily: 'Silkscreen', color: '#8A8A8A', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
      NOBODY HIT 50 CHORE POINTS THIS WEEK.
    </Text>
    <Text style={{ fontFamily: 'Silkscreen', color: '#8A8A8A', fontSize: 11, marginTop: 8, textAlign: 'center', opacity: 0.75 }}>
      No tribute. No winner bonus. Next round starts fresh.
    </Text>
    <Pressable onPress={acknowledgeAndContinue} style={{ marginTop: 40 }}>
      {({ pressed }) => (
        <View style={{
          borderWidth: 3,
          borderColor: '#FFCC00',
          backgroundColor: pressed ? '#FFCC00' : '#000000',
          paddingHorizontal: 24,
          paddingVertical: 12,
        }}>
          <Text style={{ fontFamily: 'PressStart2P', color: pressed ? '#000000' : '#FFCC00', fontSize: 12, letterSpacing: 2 }}>
            ACKNOWLEDGE
          </Text>
        </View>
      )}
    </Pressable>
  </View>
)}
```

`acknowledgeAndContinue` must match the pattern used by the existing `'tied'` mode's ACK (which either walks to the next unresolved round via `ackKeyForRound` or pops to home).

- [ ] **Step 3: Mode-picking logic**

At the top of `over.tsx`, wherever `mode` is derived from the loaded round, add a check so that `round.status === 'inactive'` resolves to `mode = 'inactive'` before any tribute branches.

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/\(round\)/over.tsx lib/tribute.ts
git commit -m "feat(round-over): inactive round mode — ACK screen, no tribute"
```

---

## Task 11: Smoke test and verify

**Files:** none modified; runtime verification only.

- [ ] **Step 1: Type-check full repo**

```bash
cd /Users/shayavivi/Desktop/Projects/Chore\ Quest/chore-quest
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Run full Deno test suite**

```bash
deno test supabase/functions/_shared/
```

Expected: all tests pass. Run count should include the 4 new tests added in Task 5 (dead-round, one-above threshold, non-chore zero, legacy log).

- [ ] **Step 3: Launch the app**

```bash
npx expo start --ios
```

(Press `i` to open in the iOS simulator if it doesn't auto-open.)

- [ ] **Step 4: Arsenal visual smoke**

After app loads and you're signed in / paired:

- Open the ARSENAL drawer.
- Tap into each of the 6 worlds and verify:
  - All activity names are fully readable (no `…` truncation anywhere across 44 rows).
  - Household rows show TWO numbers on the left rail (blue round pts over yellow shop coins).
  - Non-household rows show ONE centered yellow number.
  - Qualifier line appears under each name in a muted gray; rows with no qualifier (MAKE BED, TRASH, EXAM, MOP FLOORS) still have uniform height.
  - No world emoji chip on any row (the chip-on-every-row pattern is gone).

- [ ] **Step 5: Strike flow smoke**

- Strike a chore (DISHES). Verify `+5` shop-coin damage pop flies up. Today-haul HUD advances by 5 coins. Round view (anywhere round score is displayed) advances by 10 chore points.
- Strike a non-chore (GYM SESSION). Verify `+30` shop-coin damage pop. Today-haul HUD advances by 30 coins. Round view does NOT advance.

- [ ] **Step 6: Dead-round smoke**

- Open Menu → 🛠 FORCE CLOSE ROUND.
- If the current round has <50 chore points on both sides, verify after the cron tick (or invoke the edge function from the Supabase dashboard manually):
  - App auto-navigates to `(round)/over.tsx` in the new `'inactive'` mode.
  - Screen shows "ROUND INACTIVE" + "NOBODY HIT 50 CHORE POINTS THIS WEEK" + ACK button.
  - Tapping ACK dismisses to home. No tribute card was ever shown.
  - Database shows the round with `status = 'inactive'`, `loser_id = null`, `winner_bonus_coins = 0`, `tribute_shop_item_id = null`.

- [ ] **Step 7: Live round smoke (if time)**

- Ensure current round has >50 chore points on at least one side (log chores until over threshold).
- Force-close and verify the normal cinematic → tribute-card → hold-to-collect flow still works. Nothing about this flow changed beyond the score source.

- [ ] **Step 8: Commit any smoke-test fixes**

If any manual checks reveal a bug, fix it with a follow-up commit and re-run the relevant step.

---

## Self-review

I walked through the spec's sections against this plan:

- **§1 Principles** — each principle has a mapped task. "Chores are the Quest" = Task 5 (round-close). "Every strike pays the shop" = Task 6 (logger). "Names are arcade moves" = Task 1 (migration §2.3). "Uniform row rhythm" = Task 8 (MoveCard, `minHeight` on qualifier text). "Kill redundancy" = Task 8 (removed slot, COINS label, x/y text, chip). "Dead rounds skip tribute" = Task 5 (threshold) + Task 7 (rollover push handling) + Task 10 (over.tsx UI).
- **§2.1 Activity columns** = Task 1 step 1.
- **§2.1b Logs column** = Task 1 step 1.
- **§2.2 Archive 13** = Task 1 step 1.
- **§2.3 Rewrite 44** = Task 1 step 2.
- **§2.4 rounds.status inactive** = Task 1 step 1.
- **Shared round-close** = Task 5.
- **Log insertion computing round_value_earned** = Task 6 (client `lib/logger.ts`) + Task 1 step 3 (dev RPC).
- **Dead-round threshold** = Task 5.
- **§3 activity table** = Task 1 step 2 (data) + Task 3 (seed).
- **§4 Visual spec** = Task 8 (MoveCard) + Task 9 (StrikeDrawer swap and MoveRow delete).
- **§5 Activity loading with archived filter** = Task 6 step 3.
- **§6 Round-close changes** = Tasks 5 + 7.
- **§7 Testing** = Task 5 tests + Task 11 smoke checklist.
- **§8 Migration sequencing** = Task 1 step order (columns, archive, rewrite, rounds status, RPC) + Task 7 (edge function deploy).
- **§9 Player-facing impact** — no task (expository).

No placeholders found on a second read-through. Type names consistent between tasks (`round_value_earned`, `round_value`, `archived_at`, `CloseStatus`). Migration number `0018` used consistently.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-19-arsenal-dual-currency-redesign.md`.
