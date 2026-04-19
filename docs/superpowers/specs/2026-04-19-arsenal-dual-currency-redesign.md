# Arsenal — Dual-Currency Redesign

**Date:** 2026-04-19
**Feature:** (1) Visual redesign of the Arsenal move-list, (2) dual-currency scoring (chores earn round points + shop coins; non-chores earn shop coins only), (3) 57→44 activity content rewrite with short arcade-style names and qualifier-rule descriptions.
**Status:** Design approved, pending implementation plan

## Problem

Two issues surfaced and share a root cause:

1. **The Arsenal row is hard to read.** Activity names like "Focused study block (90 min, phone away)" and "Wipe down appliances (stove, microwave)" truncate at ~12 characters in the current `MoveRow` (PressStart2P 9px, `numberOfLines={1}`). Players can't identify the activity they're about to strike.

2. **The scoring model contradicts the game's theme.** The app is called *Chore Quest*, yet a player can currently win a weekly round entirely by going to the gym, never touching a dish, and collect tribute from the chore-doer. Every world contributes equally to round score — the game named after chores does not privilege chores.

Root cause of both: activities carry too much in a single row and a single scoring role. The `name` column fuses a display label with a qualifier rule. The `base_value + bonus` number fuses round-winning currency with shop-spending currency. Fixing one in isolation perpetuates the other.

## Goal

Ship a redesigned Arsenal that:

1. Shows activity names clearly at a glance (no truncation on any of 44 activities, any device).
2. Separates "round competition" and "personal economy" into two distinct currencies with different rules.
3. Makes the household world the structurally-exclusive path to winning a round.
4. Keeps fitness / diet / reading / university motivating via the shop economy without letting them affect round outcome.
5. Shrinks the Arsenal from 57 → 44 curated activities (removing micro-logging spam-vectors like WATER, PROTEIN, MACROS, MEAL LOG, and duplicate deep-clean moves).
6. Rewrites every activity into a short punchy move name with a qualifier-rule surfaced as a secondary line.

## Non-goals

- No schema change to `activities.name` or `activities.description` — content updates via migration only.
- No new worlds. Six worlds stay (gym, aerobics, university, diet, household, reading).
- No changes to world picker (`WorldCard` grid) or world metadata (emoji/accent/label).
- No changes to push notifications, pairing, auth, or Phase 2+ forever-layer tables.
- No sprite/asset work — emoji placeholders continue.
- No Shop UI changes beyond whatever the new shop-coin source naturally implies (shop stays on Phase-1 placeholder until separate [shop spec](./2026-04-19-shop-design.md) ships).
- No change to tribute tier calculation (Paper Cut / Knockout / Total Carnage / Flawless) — those still key off round-score margin, which still exists, just sourced from chores only.
- No re-architecture of rounds or round rollover beyond the specific columns/thresholds named below.

---

## §1 — Principles

- **Chores are the Quest.** Only household activities contribute to round score. Everything else is exiled from round scoring, by design.
- **Every strike pays the shop.** Chore strikes pay BOTH round points and shop coins. Non-chore strikes pay shop coins only. The round winner is not impoverished by winning.
- **Names are arcade moves.** All-caps, short, punchy (SQUATS, DEEP STUDY, WIPE APPLIANCES). The qualifier rule lives in `description`, rendered as a second muted line (`·`-separated).
- **Uniform row rhythm.** Rows are the same height even when an activity has no natural qualifier (MAKE BED, TRASH). Blank qualifier slot preserves scan cadence.
- **Kill redundancy in the row.** Inside a world view, a world-emoji chip on every row is noise. Border color carries world identity. Slot numbers and "COINS" labels are removed — the yellow `+N` already reads as coins.
- **Dead rounds skip tribute.** If neither player accumulates ≥50 chore points in a round, no tribute fires, no winner bonus, round status `'inactive'`. Prevents zero-chore weeks from triggering empty rituals.

---

## §2 — Data model

### Migration `0018_dual_currency_and_activity_rewrite.sql`

(Latest migration file on disk is `0017_shop_purchase_triggers.sql` as of 2026-04-19 — `0014`–`0017` are taken. `0013` is the last one confirmed applied to live per STATE.md; anything after may be unapplied drafts. Confirm live-DB state before pushing 0018.)

Five concerns, one migration.

**2.1 Add columns to `activities`**

```sql
ALTER TABLE activities
  ADD COLUMN round_value   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN archived_at   TIMESTAMPTZ;
CREATE INDEX activities_not_archived_idx ON activities(world) WHERE archived_at IS NULL;
```

- `round_value` is 0 for non-household activities, positive for household.
- `base_value + bonus` stays as-is and now represents shop-coin payout exclusively.
- `archived_at` hides cut activities without deleting (protects FK integrity on existing logs).

**2.1b Add `round_value_earned` snapshot column to `logs`**

```sql
ALTER TABLE logs
  ADD COLUMN round_value_earned INTEGER NOT NULL DEFAULT 0;
```

Logs store a snapshot of per-strike economics at insert time (`coins_earned`, `xp_earned`, `jackpot_share`, `personal_share`, all the multiplier columns). `round_value_earned` joins that family. Computed at log-insert as `round_value * (multipliers)` for chore activities, 0 otherwise. The column stays 0 on all pre-migration logs, which is correct — they predate the dual-currency model and continue to behave as non-contributing to round score. Rounds already closed are unaffected. Rounds currently open and overlapping the migration will see any pre-migration chore logs count zero toward round score; post-migration chore logs in the same round count normally. Acceptable because we control deployment timing — fresh round starts Sunday, deploy during a weekend lull.

**2.2 Archive the 13 cut activities**

```sql
UPDATE activities SET archived_at = NOW()
WHERE name IN (
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

**2.3 Rewrite the 44 survivors** — see §3 for full table. Each row becomes an `UPDATE activities SET name=?, description=?, base_value=?, bonus=?, daily_cap=?, round_value=? WHERE name=?` keyed on the current old name.

**2.4 Extend `rounds.status` CHECK to include `'inactive'`**

```sql
ALTER TABLE rounds DROP CONSTRAINT rounds_status_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_status_check
  CHECK (status IN ('open', 'closed', 'inactive'));
```

### Schema after migration

| Column | Role after migration |
|---|---|
| `name` | Short punchy move name (display) |
| `description` | Qualifier rule, `·`-separated (display subline) |
| `base_value` | Shop coins on strike (every world) |
| `bonus` | Additional shop coins (bonus moves) |
| `round_value` | Round points on strike (household only, else 0) |
| `archived_at` | Hidden from Arsenal if set |
| `daily_cap`, `requires_photo`, `tier`, `world` | Unchanged |

### Shared round-close module

`supabase/functions/_shared/round-close.ts` currently sums `coins_earned` per log row for each player's round total. After migration it must sum `round_value_earned` instead. Non-chore logs contribute 0 to the round, always (either because the activity is non-household, or because the snapshot was taken pre-migration).

Shop wallet (combined) still sums `coins_earned` across all logs, plus `winner_bonus_coins`, minus purchases — unchanged from today (see `lib/wallet.ts:getSpendableCoins`).

### Log insertion — how `round_value_earned` is populated

Every code path that inserts a log row must now also compute and set `round_value_earned`. Call sites:

- **Client strike path** — wherever `lib/logs.ts` (or equivalent) builds the log insert payload. Look up `activity.round_value` and (if nonzero) apply the same multipliers used to compute `coins_earned`. If the activity is non-household, `round_value` is 0 and the product is 0 — no branching needed.
- **Dev stubs** — `0014_dev_inject_stub_log.sql` (the RPC `dev_inject_stub_log`) must be updated to populate the new column. The spec-level contract: after migration, every code path that creates a log must set `round_value_earned`, or Postgres will reject the insert (NOT NULL). Default 0 on the column is for the ALTER TABLE backfill only; new inserts should set an explicit value.

Implementation plan will enumerate the exact call sites.

### Dead-round threshold

In `round-close.ts`, after computing `p1_round_pts` and `p2_round_pts`:

```
if max(p1_round_pts, p2_round_pts) < 50:
    status = 'inactive'
    loser_id = NULL
    winner_bonus_coins = 0
    tribute_shop_item_id = NULL
    push: "ROUND INACTIVE — NO TRIBUTE THIS WEEK"
    return
```

Otherwise existing flow continues (winner/loser, tier, tribute card selection, winner bonus).

---

## §3 — The 44 activities

Columns: **NAME** · **QUALIFIER** · **SHOP** (base+bonus) · **ROUND** (round_value) · **CAP** (daily_cap) · **📷** (requires_photo)

### 💪 GYM (2)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| GYM SESSION | 45+ min | 30 | 0 | 1 | — |
| NEW PR | lift | ★25 | 0 | 3 | ✓ |

### 🏃 AEROBICS (3)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| CARDIO | 30+ min | 20 | 0 | 1 | — |
| LONG CARDIO | 60+ min | 40 | 0 | 1 | — |
| CARDIO PR | personal best | ★25 | 0 | 1 | ✓ |

### 🎓 UNIVERSITY (3)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| DEEP STUDY | 90 min · phone away | 25 | 0 | 4 | — |
| ASSIGNMENT | graded · submitted | 80 | 0 | 3 | ✓ |
| EXAM | — | 120 | 0 | 2 | — |

### 🥗 DIET (6)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| MEAL PREP | full week | 60 | 0 | 1 | ✓ |
| CLEAN STREAK | 7 days | ★80 | 0 | 1 | — |
| DINNER | from scratch | 20 | 0 | 1 | — |
| LUNCH | from scratch | 15 | 0 | 1 | — |
| NO BOOZE | full day | 8 | 0 | 1 | — |
| NEW RECIPE | healthy | 30 | 0 | 1 | ✓ |

### 🧹 HOUSEHOLD · DAILY (9)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| DISHES | full round | 5 | 10 | 2 | — |
| TRASH | — | 4 | 8 | 1 | — |
| TIDY ROOM | one room | 6 | 10 | 3 | — |
| MAKE BED | — | 3 | 5 | 1 | — |
| WIPE COUNTERS | kitchen | 4 | 8 | 1 | — |
| QUICK SWEEP | one area | 5 | 10 | 2 | — |
| DISHWASHER | load or unload | 4 | 8 | 2 | — |
| POST-MEAL | full cleanup | 5 | 10 | 2 | — |
| PET + PLANTS | feed · water | 5 | 10 | 1 | — |

### 🧹 HOUSEHOLD · WEEKLY (8)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| LAUNDRY | wash · dry · fold | 15 | 30 | 1 | — |
| GROCERIES | receipt photo | 20 | 40 | 1 | ✓ |
| BED SHEETS | full change | 15 | 30 | 1 | — |
| BATHROOM | quick clean | 10 | 25 | 1 | — |
| MOP FLOORS | — | 12 | 25 | 1 | — |
| FULL VACUUM | whole place | 15 | 30 | 1 | — |
| FRIDGE | interior clean | 12 | 25 | 1 | — |
| WIPE APPLIANCES | stove · microwave | 8 | 20 | 1 | — |

### 🧹 HOUSEHOLD · MONTHLY (7)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| DEEP CLEAN | one room | 40 | 100 | 2 | ✓ |
| DECLUTTER | purge one zone | 60 | 140 | 1 | ✓ |
| OVEN INSIDE | interior scrub | 50 | 120 | 1 | — |
| WASH BEDDING | blankets · duvet | 25 | 80 | 1 | — |
| DUST | whole place | 20 | 80 | 1 | — |
| FIX SMALL | unclog or repair | 30 | 90 | 2 | — |
| BUILD PROJECT | furniture · DIY | 80 | 200 | 1 | ✓ |

### 📖 READING (6)
| NAME | QUALIFIER | SHOP | ROUND | CAP | 📷 |
|---|---|---|---|---|---|
| READ | 30 min · 20 pages | 10 | 0 | 2 | — |
| DEEP READ | 60+ min · 40+ pages | 25 | 0 | 1 | — |
| FINISHED BOOK | cover photo | ★80 | 0 | 2 | ✓ |
| AUDIO LEARN | 30+ min | 8 | 0 | 2 | — |
| PAPER | full read | 40 | 0 | 2 | — |
| READ NOTES | summary | 15 | 0 | 2 | — |

**Balance rationale:**

- Round-point sum of ALL weekly chores (everyone doing everything once): 235. Sum of ALL dailies maxed out per day × 7 days: ~550. Maxing a full week on dailies alone = ~770. Adding one monthly = ~870–1070. Margin spreads for Paper Cut (0–50), Knockout (51–150), Total Carnage (151–400), Flawless (400+ or override conditions) feel achievable.
- Shop-coin ceiling for a chore-heavy week (same pattern): ~350 coins. For a fitness-heavy non-chore week (gym daily, one CLEAN STREAK, a book): ~350 coins. Roughly matched; no strictly-dominant currency lane.
- Dead-round threshold of 50 = just over one day of max dailies. Prevents true neglect weeks from producing tribute theater, but doesn't punish a quiet week where one partner put in real but modest work.

---

## §4 — Row visual spec (MoveCard simplification)

The existing `components/game/MoveCard.tsx` is the starting point. Changes.

### Layout

```
┌──────┬────────────────────────────┬──────┐
│      │  MOVE NAME                 │      │
│ pay- │  qualifier · rule          │ ammo │
│ out  │  ★ BONUS 📷 PHOTO (opt)    │ pips │
└──────┴────────────────────────────┴──────┘
```

**Chore rows (household)** — payout rail stacks two numbers:
```
┌──────┐
│ +10  │  ← round points, in world accent (blue #2121FF)
│  +5  │  ← shop coins, in yellow
└──────┘
```

**Non-chore rows** — payout rail centered single number:
```
┌──────┐
│      │
│ +30  │  ← shop coins, in yellow, vertically centered
│      │
└──────┘
```

### Dimensions

| Element | Value |
|---|---|
| Row min-height | 72px |
| Left rail width | 56px |
| Right rail width | 52px |
| Border | 3px, world accent |
| Drop shadow slab | 4px offset, `#000000` |
| Press offset | translate(+4, +4) |

### Typography

| Element | Font | Size | Weight / color |
|---|---|---|---|
| Name | PressStart2P | 10px | white, lineHeight 14, `numberOfLines={2}` |
| Qualifier | Silkscreen | 9px | `#8A8A8A` (new muted gray — softer than `#4A4A4A` which reads "disabled") |
| Round points (chore) | PressStart2P | 16px | world accent hex |
| Shop coins | PressStart2P | 16px (chore secondary) / 18px (non-chore primary) | `#FFCC00` |
| Badges (★ BONUS, 📷 PHOTO, tier) | PressStart2P | 7px | badge accent (yellow / cyan / pink) |
| Ammo pip | — | 8×12px with 1px border | world accent or `#4A4A4A` if depleted |

### States

| State | Visual |
|---|---|
| Active | border + text = world accent, bg `#000000` |
| Depleted (usesLeft=0) | opacity 0.45, border + text `#4A4A4A`, diagonal red `DEPLETED` stamp (unchanged from today's MoveCard) |
| Strike flash | scale 1 → 1.04 over 260ms, damage number `+N` flies up 40px over 900ms, fades (unchanged from today's MoveCard) |
| No qualifier (TRASH, MAKE BED, EXAM, MOP FLOORS) | render empty qualifier line to preserve uniform row height |

### Removed vs existing MoveCard

- **Slot number** (`01`, `02`): removed. Adds no info; sequence is visual.
- **"COINS" label** under `+N`: removed. Yellow `+N` is unambiguous.
- **`2/3` text next to pips**: removed. Pips are the count.
- **World emoji chip** (was in `MoveRow`): removed. Border color = world accent carries world identity. WorldMovesHeader at top already states the world.

### Files affected

- `components/game/MoveCard.tsx` — apply simplifications + add chore dual-payout rail.
- `components/game/StrikeDrawer.tsx` — replace `<MoveRow />` with `<MoveCard />` in `renderMoveRow()`. Also pass `round_value` through.
- `components/game/MoveRow.tsx` — delete. No remaining consumers after the swap.
- `lib/types.ts` — extend `Activity` type: add `round_value: number` and `archived_at: string | null`.

---

## §5 — Activity loading

`lib/activities.ts` (or wherever activities are fetched) must filter `archived_at IS NULL`. Find-and-verify: check the current query in the Arsenal boot path and apply the filter.

---

## §6 — Round-close changes

File: `supabase/functions/_shared/round-close.ts`

### Changes

1. **Score source**: sum `round_value` per log (not `base_value + bonus`). Existing `worldIdBuckets` / `totalPerPlayer` logic remains; only the summed field changes.
2. **Dead-round check**: after computing `p1RoundPts` and `p2RoundPts`, if `max(...)` < 50, return a close result with `status: 'inactive'`, `loser_id: null`, `winner_bonus_coins: 0`, `tribute_shop_item_id: null`.
3. **Winner bonus formula**: stays "25% of margin capped at 500", but operates on chore-point margin. With the proposed scale, typical margins sit in the 50–300 range → winner bonus 12–75 shop coins per round. Larger (near-Flawless) rounds land the full cap.
4. **Tribute tier thresholds**: currently based on absolute margin. Because the round-point scale is tighter than the old coin scale, re-tune thresholds (concrete values in the implementation plan, not here — depends on live telemetry). Default starter values: Paper Cut 1–50, Knockout 51–150, Total Carnage 151–400, Flawless 400+ (or existing override conditions).

### Edge function touch-points

- `supabase/functions/round-rollover-tick/index.ts` — consumes `round-close.ts` output. Add handling for `status: 'inactive'` (no push tribute events, send a single "ROUND INACTIVE" push to both players).
- `supabase/functions/on-log-inserted/index.ts` — no change; it reacts to log events, not round-close math.

### Client touch-points

- `app/(round)/over.tsx` — add an `'inactive'` mode (alongside cinematic/pick/await/collect/acknowledge/tied). Shows a muted "ROUND INACTIVE · no tribute this week" panel, single ACK button.
- `lib/tribute.ts` — `loadUnresolvedClosedRounds` should include inactive rounds for the over.tsx redirect; `forceCloseCurrentRound` already calls the RPC which will route through new logic.

---

## §7 — Testing

### Deno (pure shared module)

Add to `supabase/functions/_shared/tribute-tiers.test.ts` and a new `round-close.test.ts` covering:

- `round_value_earned` sum correctness — a chore log's `round_value_earned` counts, a non-chore log's (always 0) contributes 0.
- Dead-round threshold — both players under 50, status is `'inactive'`, no loser, no bonus, no tribute card.
- One-above threshold — if p1 at 60, p2 at 30, round is valid; p1 wins; margin 30; Paper Cut tier.
- Mixed world logs — p1 logs 10 GYM SESSIONs (each `round_value_earned = 0`) + 1 DISHES (`round_value_earned = 10`); p1's round total is 10.
- Legacy-log scenario — logs inserted before migration (`round_value_earned = 0` by default) contribute 0 even if their activity is now a chore.
- Margin-tier boundary cases at the retuned thresholds.

### Client (manual smoke after migration)

- Arsenal opens → 44 activities visible across 6 worlds, none truncated.
- Each chore row shows two numbers (round + shop) in world accent and yellow respectively.
- Each non-chore row shows single centered shop-coin number.
- Strike a chore, strike a non-chore — `today_coins` HUD updates correctly for both; round view updates only for chore.
- `dev_force_close_round` Menu button on a dead round → inactive route, no cinematic, ACK-only screen.
- `dev_force_close_round` on a mixed round → normal cinematic, winner determined by chore points only.

### Data integrity

- Post-migration query: `SELECT count(*) FROM activities WHERE archived_at IS NULL` = 44.
- Post-migration query: `SELECT count(*) FROM activities WHERE world = 'household' AND round_value > 0 AND archived_at IS NULL` = 24.
- Any existing logs referencing archived activities still resolve (FK preserved).

---

## §8 — Migration sequencing

Order of operations in `0018_dual_currency_and_activity_rewrite.sql`:

1. `ALTER TABLE activities ADD COLUMN round_value INTEGER NOT NULL DEFAULT 0;`
2. `ALTER TABLE activities ADD COLUMN archived_at TIMESTAMPTZ;`
3. `CREATE INDEX activities_not_archived_idx ON activities(world) WHERE archived_at IS NULL;`
4. `ALTER TABLE logs ADD COLUMN round_value_earned INTEGER NOT NULL DEFAULT 0;`
5. `UPDATE activities SET archived_at = NOW() WHERE name IN (...13 cut names...);`
6. `UPDATE activities SET ...` for each of the 44 survivors (new name, description, base_value, bonus, daily_cap, round_value).
7. `ALTER TABLE rounds DROP CONSTRAINT rounds_status_check;`
8. `ALTER TABLE rounds ADD CONSTRAINT rounds_status_check CHECK (status IN ('open', 'closed', 'inactive'));`

Post-migration code deploys (in this order):

1. Client build including new log-insert path that sets `round_value_earned`.
2. Updated `round-rollover-tick` edge function that reads `round_value_earned` and handles `'inactive'` status.
3. `dev_inject_stub_log` RPC update to populate `round_value_earned` in dev flows.

After migration:

- `supabase/seed.sql` rewritten to match (so fresh installs get the new names + round_value, archived rows never seeded).
- Deploy updated `round-rollover-tick` edge function (reads `round_value`, handles `'inactive'`).
- Deploy client with new `MoveCard`, inactive round route, `archived_at` filter.

Migration is reversible by reversing 4 and 5 (names/descriptions/base_values recoverable from old seed.sql) and dropping the two new columns. Inactive-status rounds would need a manual cleanup if any exist; fine for Phase 1.

---

## §9 — What this changes for the player

- The Arsenal becomes skimmable. You can see what every move is at a glance.
- The HOUSEHOLD world is marked visually as "this is where rounds are won" — both numbers on every row, the only world where round points are nonzero.
- The other five worlds become "personal growth + shop economy" — still valuable, still fun, still yielding coins, but no longer crowding out chores in the round race.
- A lazy-chores week means an inactive round — no tribute, no winner bonus, and a "nobody did the dishes" signal that both partners see at round close. The game refuses to manufacture drama from neglect.
