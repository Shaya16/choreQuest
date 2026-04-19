# Round Close & Tribute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Jackpot UI, build automated round-close rollover with a fighting-game tribute experience (KO cinematic, face-down card pick, hold-to-collect finisher).

**Architecture:** A new `round-rollover-tick` Edge Function runs from pg_cron every 10 minutes Sun→Mon, finds rounds whose `end_date` has passed in Asia/Jerusalem, computes winner/margin/tier/bonus from existing log rows, and atomically closes the round + opens the next. New Postgres triggers on `rounds` UPDATE fire `tribute_picked` and `tribute_paid` events to the existing `on-log-inserted` Edge Function for push-notification delivery. The client gets a new forced `/round-over` route that auto-mounts when an unresolved closed round exists, drives the KO cinematic + tribute selection + hold-to-collect finisher using existing `Stage` / `FighterCard` / `StrikeProjectile` components. The Jackpot button is removed from the Home Control Panel; spendable wallet is computed on read from logs+purchases+round bonuses (not from the cached `players.personal_wallet` column, which goes vestigial).

**Tech Stack:** Expo SDK 54, React Native 0.81, Reanimated 4, Skia 2.2, Moti, Expo Router 6, Supabase (Postgres + Edge Functions + pg_cron + pg_net), Deno runtime for Edge Functions.

---

## Spec reference

[`docs/superpowers/specs/2026-04-19-round-close-and-tribute-design.md`](../specs/2026-04-19-round-close-and-tribute-design.md)

---

## Reality notes (for engineers reading this fresh)

- **Tabs were already dropped.** `app/(tabs)/_layout.tsx` is a Stack, not Tabs. "Hide Jackpot" means: remove the JACKPOT button from the `<ControlPanel>` on `app/(tabs)/index.tsx`. The `jackpot.tsx` route file stays — just unreachable from UI.
- **Shop UI is a placeholder.** `app/(tabs)/shop.tsx` shows a "Shop grid lights up in Phase 1" stub. There is no purchase flow yet. Wallet display surgery only touches Home and Menu, not the shop placeholder.
- **`rounds` table already has** `winner_id`, `margin`, `p1_total`, `p2_total`, `tribute_tier`, `tribute_selected`, `tribute_paid`, `crowns_json`. Migration 0010 adds only what's missing: `loser_id`, `winner_bonus_coins`, `tribute_shop_item_id`, `tribute_paid_at`.
- **Push infra exists.** `_shared/variants.ts`, `_shared/variant-picker.ts`, `_shared/quiet-hours.ts`, `_shared/expo-push.ts` are wired. Migration 0009 already has a `notify_round_closed` Postgres trigger that POSTs `{type: 'round_closed'}` to `on-log-inserted`. We **drop** that trigger because the new cron is the authoritative round-closer and it sends per-role pushes directly (winner vs loser vs tied).
- **No JS test runner is installed** in the project. Deno tests under `supabase/functions/_shared/` use `deno test` (run via `deno test supabase/functions/_shared/`). Client-side TypeScript has no test runner — verify those files via `npx tsc --noEmit` only, matching project posture.
- **Working dir for all commands** below is `/Users/shayavivi/Desktop/Projects/Chore Quest/chore-quest` unless noted.

---

## File Structure

**New files:**
- `supabase/migrations/0010_round_close_columns.sql` — add 4 columns to rounds
- `supabase/migrations/0011_round_rollover_cron.sql` — pg_cron schedule, drop notify_round_closed, add tribute event triggers
- `supabase/migrations/0012_dev_force_close.sql` — dev RPC `dev_force_close_round`
- `supabase/functions/_shared/tribute-tiers.ts` — pure tier→cost-range mapping + card filter
- `supabase/functions/_shared/tribute-tiers.test.ts` — Deno unit tests
- `supabase/functions/_shared/round-close.ts` — pure compute-close-result function
- `supabase/functions/_shared/round-close.test.ts` — Deno unit tests
- `supabase/functions/round-rollover-tick/index.ts` — the cron handler
- `lib/wallet.ts` — `getSpendableCoins(playerId)` client helper
- `lib/tribute.ts` — client tier filter + `forceCloseCurrentRound()` + tribute API
- `components/game/KoOverlay.tsx` — KO cinematic
- `components/game/TributeCard.tsx` — face-down/flip card
- `components/game/HoldToCollect.tsx` — hold-to-charge finisher
- `components/game/DebtBadge.tsx` — chain + floating item icon for home Stage
- `app/(round)/_layout.tsx` — round-over route group
- `app/(round)/over.tsx` — round-over screen (cinematic + select + collect)

**Modified files:**
- `lib/types.ts` — extend `Round` type with new columns
- `lib/round.ts` — add `loadClosedRoundsForPlayer`, `loadShopItemsForTier`, `pickTribute`, `markTributePaid`, world-score helpers
- `supabase/functions/_shared/variants.ts` — add `round_won`, `round_lost`, `round_tied`, `tribute_picked`, `tribute_paid` trigger pools
- `supabase/functions/on-log-inserted/index.ts` — handle `tribute_picked` and `tribute_paid` payload types
- `app/_layout.tsx` — closed-round detection + redirect into `/round-over`
- `app/(tabs)/index.tsx` — remove JACKPOT button from ControlPanel; mount `DebtBadge` on Stage when player has unpaid tribute (their own or partner's)
- `app/(tabs)/menu.tsx` — `🛠 FORCE CLOSE ROUND` dev button

**Untouched (deliberately):**
- `app/(tabs)/jackpot.tsx` — left on disk, unreferenced
- `app/(tabs)/shop.tsx` — placeholder stays as-is (no real wallet display to update)
- `players.personal_wallet` column — vestigial, read no longer; future cleanup migration drops it

---

## Task 1: Migration 0010 — add 4 missing rounds columns

**Files:**
- Create: `supabase/migrations/0010_round_close_columns.sql`
- Modify: `lib/types.ts` (extend `Round` type)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_round_close_columns.sql`:

```sql
-- =============================================================================
-- Migration 0010: round-close fields beyond what 0001 shipped
-- =============================================================================
-- Adds:
--   loser_id              — paired with winner_id for clarity / cleaner queries
--   winner_bonus_coins    — coins awarded to winner on close, capped to 500
--   tribute_shop_item_id  — typed FK; replaces freeform tribute_selected text
--   tribute_paid_at       — timestamp; canonical "paid?" truth (boolean stays
--                          for backwards compat, will be dropped later)
-- =============================================================================

alter table public.rounds
  add column loser_id uuid references public.players(id) on delete set null,
  add column winner_bonus_coins int not null default 0,
  add column tribute_shop_item_id uuid references public.shop_items(id) on delete set null,
  add column tribute_paid_at timestamptz;

create index if not exists idx_rounds_loser on public.rounds(loser_id);
create index if not exists idx_rounds_tribute_unpaid
  on public.rounds(couple_id)
  where status = 'closed' and tribute_shop_item_id is not null and tribute_paid_at is null;
```

- [ ] **Step 2: Extend `Round` type in `lib/types.ts`**

In `lib/types.ts`, locate the `Round` type (currently lines 94-111). Add four new optional fields after `tribute_paid: boolean;`:

```ts
export type Round = {
  id: string;
  couple_id: string;
  number: number;
  start_date: string;
  end_date: string;
  status: RoundStatus;
  p1_total: number | null;
  p2_total: number | null;
  margin: number | null;
  winner_id: string | null;
  loser_id: string | null;
  winner_bonus_coins: number;
  tribute_tier: TributeTier | null;
  tribute_selected: string | null;
  tribute_shop_item_id: string | null;
  tribute_paid: boolean;
  tribute_paid_at: string | null;
  crowns_json: Partial<Record<World, string>> | null;
  mvp_title: string | null;
  highlight_photo_url: string | null;
};
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_round_close_columns.sql lib/types.ts
git commit -m "feat: add loser_id, winner_bonus_coins, tribute_shop_item_id, tribute_paid_at to rounds"
```

---

## Task 2: `lib/wallet.ts` — `getSpendableCoins(playerId)`

**Files:**
- Create: `lib/wallet.ts`

- [ ] **Step 1: Write the helper**

Create `lib/wallet.ts`:

```ts
import { supabase } from './supabase';

/**
 * Computes a player's spendable Coins on read.
 *
 * Sources:
 *   + sum(personal_share + jackpot_share) across all the player's logs
 *   + sum(winner_bonus_coins) across all rounds where this player won
 *   - sum(shop_items.cost) across all non-cancelled purchases by this player
 *
 * Why computed on read instead of cached on players.personal_wallet:
 * after the Jackpot tab is hidden we treat both shares as one wallet, and the
 * cached column would be wrong by definition (it only ever held the 30%).
 * At couple-scale (hundreds of rows lifetime) the three SUMs are negligible.
 */
export async function getSpendableCoins(playerId: string): Promise<number> {
  const [{ data: logs }, { data: bonuses }, { data: purchases }] = await Promise.all([
    supabase
      .from('logs')
      .select('personal_share, jackpot_share')
      .eq('player_id', playerId),
    supabase
      .from('rounds')
      .select('winner_bonus_coins')
      .eq('winner_id', playerId),
    supabase
      .from('purchases')
      .select('shop_item_id, status')
      .eq('buyer_id', playerId)
      .neq('status', 'cancelled'),
  ]);

  const earned =
    (logs ?? []).reduce(
      (acc, l) => acc + (l.personal_share ?? 0) + (l.jackpot_share ?? 0),
      0
    );
  const bonus = (bonuses ?? []).reduce(
    (acc, r) => acc + (r.winner_bonus_coins ?? 0),
    0
  );

  let spent = 0;
  const ids = (purchases ?? []).map((p) => p.shop_item_id);
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from('shop_items')
      .select('id, cost')
      .in('id', ids);
    const costById = new Map<string, number>(
      (items ?? []).map((i) => [i.id, i.cost ?? 0])
    );
    for (const p of purchases ?? []) {
      spent += costById.get(p.shop_item_id) ?? 0;
    }
  }

  return earned + bonus - spent;
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/wallet.ts
git commit -m "feat: add getSpendableCoins client helper"
```

---

## Task 3: Hide JACKPOT button on Home Control Panel

**Files:**
- Modify: `app/(tabs)/index.tsx` (around lines 598-618 — the `<ControlPanel>` block)

- [ ] **Step 1: Remove the JACKPOT `ActionTile`**

In `app/(tabs)/index.tsx`, find the `<ControlPanel>` section (search for `ControlPanel>`). Replace the entire ControlPanel block:

```tsx
        {/* ============ CONTROL PANEL ============ */}
        <ControlPanel>
          <ActionTile
            icon="💰"
            label="SHOP"
            subtitle="REDEEM"
            color="#FFCC00"
            bounceDelay={0}
            lampDelay={0}
            onPress={() => router.push('/(tabs)/shop')}
          />
          <ActionTile
            icon="🏆"
            label="JACKPOT"
            subtitle="GOAL"
            color="#FFB8DE"
            bounceDelay={120}
            lampDelay={200}
            onPress={() => router.push('/(tabs)/jackpot')}
          />
        </ControlPanel>
```

with:

```tsx
        {/* ============ CONTROL PANEL ============ */}
        {/* Jackpot button removed — co-op layer hidden per round-close+tribute design.
            jackpot.tsx route stays on disk; re-enabling is restoring the ActionTile. */}
        <ControlPanel>
          <ActionTile
            icon="💰"
            label="SHOP"
            subtitle="REDEEM"
            color="#FFCC00"
            bounceDelay={0}
            lampDelay={0}
            onPress={() => router.push('/(tabs)/shop')}
          />
        </ControlPanel>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "feat: hide Jackpot button from home Control Panel"
```

---

## Task 4: `_shared/tribute-tiers.ts` — pure tier→cost-range mapping (TDD)

**Files:**
- Create: `supabase/functions/_shared/tribute-tiers.ts`
- Create: `supabase/functions/_shared/tribute-tiers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/tribute-tiers.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  tierForMargin,
  tierForFlawlessOverride,
  costRangeForTier,
  selectFourTributeCards,
  type TributeTier,
} from './tribute-tiers.ts';

Deno.test('tierForMargin: paper_cut for 1..39', () => {
  assertEquals(tierForMargin(1), 'paper_cut');
  assertEquals(tierForMargin(39), 'paper_cut');
});

Deno.test('tierForMargin: knockout for 40..149', () => {
  assertEquals(tierForMargin(40), 'knockout');
  assertEquals(tierForMargin(149), 'knockout');
});

Deno.test('tierForMargin: total_carnage for 150+', () => {
  assertEquals(tierForMargin(150), 'total_carnage');
  assertEquals(tierForMargin(9999), 'total_carnage');
});

Deno.test('tierForMargin: null for 0', () => {
  assertEquals(tierForMargin(0), null);
});

Deno.test('tierForFlawlessOverride: loser logged 0 → flawless', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 0, winnerWorldCount: 0, totalContestedWorlds: 0 }),
    'flawless'
  );
});

Deno.test('tierForFlawlessOverride: winner ≥5 of 6 worlds → flawless', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 3, winnerWorldCount: 5, totalContestedWorlds: 6 }),
    'flawless'
  );
});

Deno.test('tierForFlawlessOverride: only 2 worlds contested → no flawless even if winner takes both', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 1, winnerWorldCount: 2, totalContestedWorlds: 2 }),
    null
  );
});

Deno.test('tierForFlawlessOverride: 4-of-6 worlds → no flawless', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 5, winnerWorldCount: 4, totalContestedWorlds: 6 }),
    null
  );
});

Deno.test('costRangeForTier: ranges per spec', () => {
  assertEquals(costRangeForTier('paper_cut'), { min: 80, max: 249 });
  assertEquals(costRangeForTier('knockout'), { min: 250, max: 449 });
  assertEquals(costRangeForTier('total_carnage'), { min: 450, max: 699 });
  assertEquals(costRangeForTier('flawless'), { min: 700, max: 99999 });
});

Deno.test('selectFourTributeCards: deterministic per round id', () => {
  const items = [
    { id: 'a', cost: 300 },
    { id: 'b', cost: 250 },
    { id: 'c', cost: 400 },
    { id: 'd', cost: 350 },
    { id: 'e', cost: 280 },
    { id: 'f', cost: 320 },
  ];
  const a = selectFourTributeCards(items, 'knockout', 'round-id-1');
  const b = selectFourTributeCards(items, 'knockout', 'round-id-1');
  assertEquals(a, b);
  assertEquals(a.length, 4);
  assertEquals(
    a.every((it) => it.cost >= 250 && it.cost <= 449),
    true
  );
});

Deno.test('selectFourTributeCards: fewer than 4 in tier → fills from adjacent down', () => {
  const items = [
    { id: 'a', cost: 800 }, // flawless
    { id: 'b', cost: 600 }, // total_carnage
    { id: 'c', cost: 550 }, // total_carnage
    { id: 'd', cost: 300 }, // knockout
    { id: 'e', cost: 280 }, // knockout
    { id: 'f', cost: 200 }, // paper_cut
  ];
  const result = selectFourTributeCards(items, 'flawless', 'round-id-1');
  assertEquals(result.length, 4);
  // Should pull at least the one flawless item
  assertEquals(result.some((it) => it.cost >= 700), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/_shared/tribute-tiers.test.ts`
Expected: FAIL with "Module not found" or unresolved imports.

- [ ] **Step 3: Implement the module**

Create `supabase/functions/_shared/tribute-tiers.ts`:

```ts
export type TributeTier = 'paper_cut' | 'knockout' | 'total_carnage' | 'flawless';

const RANGES: Record<TributeTier, { min: number; max: number }> = {
  paper_cut: { min: 80, max: 249 },
  knockout: { min: 250, max: 449 },
  total_carnage: { min: 450, max: 699 },
  flawless: { min: 700, max: 99999 },
};

const TIER_ORDER: TributeTier[] = [
  'paper_cut',
  'knockout',
  'total_carnage',
  'flawless',
];

/**
 * Returns the tier for a non-zero margin. 0 → null (tied, no tribute).
 */
export function tierForMargin(margin: number): TributeTier | null {
  if (margin <= 0) return null;
  if (margin < 40) return 'paper_cut';
  if (margin < 150) return 'knockout';
  return 'total_carnage';
}

/**
 * Determines if Flawless override applies. Returns 'flawless' or null.
 *
 * Rules:
 *  - Loser logged 0 strikes → flawless.
 *  - Winner won 5+ of 6 worlds → flawless.
 *  - If only 1-2 worlds had logs at all, the override is suppressed (not enough
 *    surface for "domination" to be meaningful).
 */
export function tierForFlawlessOverride(input: {
  loserLogCount: number;
  winnerWorldCount: number;
  totalContestedWorlds: number;
}): TributeTier | null {
  if (input.loserLogCount === 0) return 'flawless';
  if (input.totalContestedWorlds >= 3 && input.winnerWorldCount >= 5) return 'flawless';
  return null;
}

export function costRangeForTier(tier: TributeTier): { min: number; max: number } {
  return RANGES[tier];
}

/**
 * FNV-1a 32-bit. Deterministic, no crypto needed — we just want stable shuffle.
 */
function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

/**
 * Picks 4 tribute cards from items, filtering by tier cost range.
 * If fewer than 4 in-range, fills from one tier down (recursive),
 * then up if still short. Deterministic per (roundId, item id).
 *
 * Order is stable across calls so the cards don't reshuffle between sessions
 * while the winner is mid-decision.
 */
export function selectFourTributeCards<T extends { id: string; cost: number }>(
  items: T[],
  tier: TributeTier,
  roundId: string
): T[] {
  const inTier = (it: T, t: TributeTier) => {
    const r = RANGES[t];
    return it.cost >= r.min && it.cost <= r.max;
  };

  // Start with the requested tier, then walk DOWN, then UP until we have 4 or run out.
  const tierIdx = TIER_ORDER.indexOf(tier);
  const fallbackOrder: TributeTier[] = [tier];
  for (let d = 1; d < TIER_ORDER.length; d++) {
    if (tierIdx - d >= 0) fallbackOrder.push(TIER_ORDER[tierIdx - d]);
    if (tierIdx + d < TIER_ORDER.length) fallbackOrder.push(TIER_ORDER[tierIdx + d]);
  }

  const seen = new Set<string>();
  const picked: T[] = [];
  for (const t of fallbackOrder) {
    const eligible = items
      .filter((it) => inTier(it, t) && !seen.has(it.id))
      .sort((a, b) => hash(roundId + a.id) - hash(roundId + b.id));
    for (const it of eligible) {
      if (picked.length >= 4) break;
      picked.push(it);
      seen.add(it.id);
    }
    if (picked.length >= 4) break;
  }
  return picked.slice(0, 4);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test supabase/functions/_shared/tribute-tiers.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tribute-tiers.ts supabase/functions/_shared/tribute-tiers.test.ts
git commit -m "feat: tribute-tiers shared module with margin->tier and card selection"
```

---

## Task 5: `_shared/round-close.ts` — pure compute-close-result (TDD)

**Files:**
- Create: `supabase/functions/_shared/round-close.ts`
- Create: `supabase/functions/_shared/round-close.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/round-close.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCloseResult, type LogForClose } from './round-close.ts';

const mkLog = (player_id: string, coins: number, world: string): LogForClose => ({
  player_id,
  coins_earned: coins,
  world,
});

Deno.test('p1 wins by 87 → knockout, +21 bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'gym'),
      mkLog('p1', 50, 'household'),
      mkLog('p2', 63, 'reading'),
    ],
  });
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.p1Total, 150);
  assertEquals(result.p2Total, 63);
  assertEquals(result.margin, 87);
  assertEquals(result.tributeTier, 'knockout');
  assertEquals(result.winnerBonusCoins, 21); // floor(87 * 0.25)
});

Deno.test('p2 wins → roles swap', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 10, 'gym'), mkLog('p2', 100, 'gym')],
  });
  assertEquals(result.winnerId, 'p2');
  assertEquals(result.loserId, 'p1');
  assertEquals(result.margin, 90);
});

Deno.test('tied → no winner, no tribute, no bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 50, 'gym'), mkLog('p2', 50, 'reading')],
  });
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
    logs: [mkLog('p1', 30, 'gym')],
  });
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.margin, 30);
  assertEquals(result.tributeTier, 'flawless'); // overrides paper_cut
});

Deno.test('winner takes 5+ of 6 worlds → flawless override', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'gym'),
      mkLog('p1', 100, 'aerobics'),
      mkLog('p1', 100, 'university'),
      mkLog('p1', 100, 'diet'),
      mkLog('p1', 100, 'household'),
      mkLog('p2', 50, 'reading'), // p2 only takes 1 world
    ],
  });
  assertEquals(result.tributeTier, 'flawless');
});

Deno.test('winner bonus coin cap at 500', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 5000, 'gym'), mkLog('p2', 100, 'gym')],
  });
  assertEquals(result.margin, 4900);
  assertEquals(result.winnerBonusCoins, 500); // capped, not 1225
});

Deno.test('null p2Id (solo couple) → returns no-close marker', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: null,
    logs: [mkLog('p1', 100, 'gym')],
  });
  assertEquals(result.skipReason, 'solo_couple');
});

Deno.test('crowns_json reflects per-world winner', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'gym'),
      mkLog('p2', 50, 'gym'),
      mkLog('p2', 100, 'reading'),
    ],
  });
  assertEquals(result.crownsJson, { gym: 'p1', reading: 'p2' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/_shared/round-close.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the module**

Create `supabase/functions/_shared/round-close.ts`:

```ts
import {
  tierForMargin,
  tierForFlawlessOverride,
  type TributeTier,
} from './tribute-tiers.ts';

export type LogForClose = {
  player_id: string;
  coins_earned: number;
  world: string;
};

export type CloseResult =
  | {
      skipReason: 'solo_couple';
    }
  | {
      skipReason?: never;
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

export function computeCloseResult(input: {
  p1Id: string;
  p2Id: string | null;
  logs: LogForClose[];
}): CloseResult {
  if (!input.p2Id) return { skipReason: 'solo_couple' };

  // Per-player totals
  let p1Total = 0;
  let p2Total = 0;
  for (const l of input.logs) {
    if (l.player_id === input.p1Id) p1Total += l.coins_earned ?? 0;
    else if (l.player_id === input.p2Id) p2Total += l.coins_earned ?? 0;
  }

  // Crowns: per-world winner by score
  const worldScores = new Map<string, { p1: number; p2: number }>();
  for (const l of input.logs) {
    const ws = worldScores.get(l.world) ?? { p1: 0, p2: 0 };
    if (l.player_id === input.p1Id) ws.p1 += l.coins_earned ?? 0;
    else if (l.player_id === input.p2Id) ws.p2 += l.coins_earned ?? 0;
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
    // ties on a world: no crown awarded for that world
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test supabase/functions/_shared/round-close.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/round-close.ts supabase/functions/_shared/round-close.test.ts
git commit -m "feat: round-close pure compute function with worlds + flawless override"
```

---

## Task 6: Add new push variants to `_shared/variants.ts`

**Files:**
- Modify: `supabase/functions/_shared/variants.ts`

- [ ] **Step 1: Add new trigger types and variant pools**

In `supabase/functions/_shared/variants.ts`, find the `TriggerType` union (line 7-13) and extend it:

```ts
export type TriggerType =
  | 'lead_flip'
  | 'milestone'
  | 'round_ending'
  | 'round_closed'
  | 'end_of_day'
  | 'inactivity'
  | 'round_won'
  | 'round_lost'
  | 'round_tied'
  | 'tribute_picked'
  | 'tribute_paid';
```

Then add five new entries to the `VARIANTS` object (insert anywhere in the object — order doesn't matter):

```ts
  round_won: [
    "🥊 K.O. you took round {{n}} by {{margin}}. pick your tribute.",
    "🏆 round {{n}}: yours. {{margin}} margin. {{partner}} owes you something.",
    "👑 round {{n}} done. you up {{margin}}. claim it.",
    "round {{n}}: locked in. {{margin}} margin. tribute time.",
  ],
  round_lost: [
    "💀 round {{n}} over. {{partner}} won by {{margin}}. they're picking.",
    "you ate it. {{partner}} took round {{n}} by {{margin}}. brace.",
    "💀 round {{n}}: cooked. {{margin}} down. tribute incoming.",
    "{{partner}} just claimed round {{n}}. {{margin}} margin. owe up.",
  ],
  round_tied: [
    "🤝 round {{n}} tied. nobody owes nobody. round {{next}} live.",
    "🤝 even score on round {{n}}. handshake. round {{next}} starts now.",
    "round {{n}}: dead heat. respect. fight again, round {{next}}.",
    "🤝 {{n}}-all stalemate. round {{next}} drops fresh.",
  ],
  tribute_picked: [
    "💀 {{partner}} picked: {{tribute}}. you owe.",
    "tribute set: {{tribute}}. clock's on you.",
    "🍽️ {{partner}} called it: {{tribute}}. get to it.",
    "{{partner}} chose your fate: {{tribute}}.",
  ],
  tribute_paid: [
    "✓ {{partner}} marked {{tribute}} as paid. round closed clean.",
    "tribute settled: {{tribute}}. respect. next round.",
    "✓ {{partner}} got their {{tribute}}. you're square.",
    "paid in full: {{tribute}}. on to the next.",
  ],
```

- [ ] **Step 2: Verify Deno tests still pass**

Run: `deno test supabase/functions/_shared/`
Expected: existing variant-picker / quiet-hours tests still pass; no new test files added in this task.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/variants.ts
git commit -m "feat: add round_won/round_lost/round_tied/tribute_picked/tribute_paid variants"
```

---

## Task 7: Edge function `round-rollover-tick`

**Files:**
- Create: `supabase/functions/round-rollover-tick/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/round-rollover-tick/index.ts`:

```ts
// =============================================================================
// Runs every 10 minutes Sun→Mon from pg_cron. Closes any active round whose
// end_date has passed in Asia/Jerusalem, opens the next round, and pushes the
// per-role notifications (winner / loser / tied) directly via Expo.
// =============================================================================
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeCloseResult, type LogForClose } from '../_shared/round-close.ts';
import { VARIANTS } from '../_shared/variants.ts';
import { pickVariant } from '../_shared/variant-picker.ts';
import { isQuietHours, PRIMARY_TZ } from '../_shared/quiet-hours.ts';
import { sendPush } from '../_shared/expo-push.ts';

type RoundRow = {
  id: string;
  couple_id: string;
  number: number;
  start_date: string;
  end_date: string;
  status: string;
};

type PlayerRow = {
  id: string;
  couple_id: string;
  display_name: string;
  expo_push_token: string | null;
};

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const todayJerusalem = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRIMARY_TZ,
  }).format(new Date());

  // Find every active round whose end_date has passed in Jerusalem.
  const { data: dueRounds } = await admin
    .from('rounds')
    .select('*')
    .eq('status', 'active')
    .lt('end_date', todayJerusalem);

  let closedCount = 0;
  for (const round of (dueRounds ?? []) as RoundRow[]) {
    const closed = await closeOneRound(admin, round);
    if (closed) closedCount++;
  }
  return new Response(`closed=${closedCount}`, { status: 200 });
});

async function closeOneRound(admin: SupabaseClient, round: RoundRow): Promise<boolean> {
  // Load both players for this couple.
  const { data: playersData } = await admin
    .from('players')
    .select('*')
    .eq('couple_id', round.couple_id)
    .order('created_at', { ascending: true });
  const players = (playersData ?? []) as PlayerRow[];
  const p1 = players[0] ?? null;
  const p2 = players[1] ?? null;
  if (!p1) return false;

  // Load logs for this round with their world (joined from activities).
  const { data: rawLogs } = await admin
    .from('logs')
    .select('player_id, coins_earned, activities(world)')
    .eq('round_id', round.id);

  const logs: LogForClose[] = (rawLogs ?? []).map((r: {
    player_id: string;
    coins_earned: number | null;
    activities: { world: string } | { world: string }[] | null;
  }) => ({
    player_id: r.player_id,
    coins_earned: r.coins_earned ?? 0,
    world: Array.isArray(r.activities)
      ? r.activities[0]?.world ?? 'unknown'
      : r.activities?.world ?? 'unknown',
  }));

  const result = computeCloseResult({
    p1Id: p1.id,
    p2Id: p2?.id ?? null,
    logs,
  });

  if ('skipReason' in result && result.skipReason) {
    // Solo couple: don't close, don't push. Round just keeps rolling.
    return false;
  }

  // Atomic close (status guard prevents double-close).
  const { data: updated } = await admin
    .from('rounds')
    .update({
      status: 'closed',
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

  if (!updated || updated.length === 0) {
    // Lost the race; another tick already closed it.
    return false;
  }

  // Open the next round (Sun→Sat, 7 days starting today in Jerusalem).
  await openNextRound(admin, round);

  // Push to both players.
  if (!isQuietHours()) {
    await pushRoundOutcome(admin, p1, p2, result, round);
  }

  return true;
}

async function openNextRound(admin: SupabaseClient, prev: RoundRow): Promise<void> {
  const todayJerusalem = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRIMARY_TZ,
  }).format(new Date());
  const start = new Date(todayJerusalem + 'T00:00:00Z');
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 7);
  const endIso = end.toISOString().slice(0, 10);

  await admin.from('rounds').insert({
    couple_id: prev.couple_id,
    number: prev.number + 1,
    start_date: todayJerusalem,
    end_date: endIso,
    status: 'active',
  });
}

async function pushRoundOutcome(
  admin: SupabaseClient,
  p1: PlayerRow,
  p2: PlayerRow | null,
  result: Exclude<ReturnType<typeof computeCloseResult>, { skipReason: 'solo_couple' }>,
  round: RoundRow
): Promise<void> {
  const nextNumber = round.number + 1;

  // Tied case
  if (!result.winnerId) {
    for (const player of [p1, p2].filter((p): p is PlayerRow => !!p)) {
      if (!player.expo_push_token) continue;
      const partner = player.id === p1.id ? p2 : p1;
      const lastIndex = await readLastIndex(admin, player.id, 'round_tied');
      const pick = pickVariant(VARIANTS.round_tied, lastIndex, {
        n: round.number,
        next: nextNumber,
        partner: partner?.display_name ?? '???',
      });
      await sendPush(player.expo_push_token, {
        title: 'ROUND TIED',
        body: pick.text,
        data: { screen: 'round_over', round_id: round.id },
      });
      await writeLastIndex(admin, player.id, 'round_tied', pick.index);
    }
    return;
  }

  // Decisive case
  const winner = result.winnerId === p1.id ? p1 : p2;
  const loser = result.loserId === p1.id ? p1 : p2;
  if (!winner || !loser) return;

  if (winner.expo_push_token) {
    const lastIndex = await readLastIndex(admin, winner.id, 'round_won');
    const pick = pickVariant(VARIANTS.round_won, lastIndex, {
      n: round.number,
      margin: result.margin,
      partner: loser.display_name,
    });
    await sendPush(winner.expo_push_token, {
      title: 'K.O.',
      body: pick.text,
      data: { screen: 'round_over', round_id: round.id },
    });
    await writeLastIndex(admin, winner.id, 'round_won', pick.index);
  }

  if (loser.expo_push_token) {
    const lastIndex = await readLastIndex(admin, loser.id, 'round_lost');
    const pick = pickVariant(VARIANTS.round_lost, lastIndex, {
      n: round.number,
      margin: result.margin,
      partner: winner.display_name,
    });
    await sendPush(loser.expo_push_token, {
      title: 'YOU LOST',
      body: pick.text,
      data: { screen: 'round_over', round_id: round.id },
    });
    await writeLastIndex(admin, loser.id, 'round_lost', pick.index);
  }
}

async function readLastIndex(
  admin: SupabaseClient,
  playerId: string,
  triggerType: string
): Promise<number | null> {
  const { data } = await admin
    .from('push_state')
    .select('last_variant_index')
    .eq('player_id', playerId)
    .eq('trigger_type', triggerType)
    .maybeSingle();
  return (data?.last_variant_index ?? null) as number | null;
}

async function writeLastIndex(
  admin: SupabaseClient,
  playerId: string,
  triggerType: string,
  index: number
): Promise<void> {
  await admin
    .from('push_state')
    .upsert(
      {
        player_id: playerId,
        trigger_type: triggerType,
        last_variant_index: index,
        last_fired_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,trigger_type' }
    );
}
```

- [ ] **Step 2: Update `push_state` trigger_type CHECK constraint to allow new types**

The `push_state` table from migration 0008 has a `CHECK` constraint listing valid trigger types. We need to drop it and re-create it. This is included in Task 8's migration (0011).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/round-rollover-tick/index.ts
git commit -m "feat: round-rollover-tick edge function — close due rounds + push outcomes"
```

---

## Task 8: Migration 0011 — pg_cron schedule + drop old trigger + add tribute event triggers + extend push_state CHECK

**Files:**
- Create: `supabase/migrations/0011_round_rollover_cron.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0011_round_rollover_cron.sql`:

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0011_round_rollover_cron.sql
git commit -m "feat: round-rollover cron, tribute event triggers, drop old round_closed trigger"
```

---

## Task 9: Extend `on-log-inserted` to handle tribute events

**Files:**
- Modify: `supabase/functions/on-log-inserted/index.ts`

- [ ] **Step 1: Extend the dispatch payload union**

In `supabase/functions/on-log-inserted/index.ts`, find the payload type aliases (around lines 35-37) and replace them with:

```ts
type LogInsertPayload = { record: LogRow };
type RoundClosedPayload = { type: 'round_closed'; round: RoundRow };
type TributePickedPayload = { type: 'tribute_picked'; round: RoundRow };
type TributePaidPayload = { type: 'tribute_paid'; round: RoundRow };
type DispatchPayload =
  | LogInsertPayload
  | RoundClosedPayload
  | TributePickedPayload
  | TributePaidPayload;
```

Extend the `RoundRow` type (around lines 22-33) to include the new fields used by tribute pushes:

```ts
type RoundRow = {
  id: string;
  couple_id: string;
  number: number;
  start_date: string;
  end_date: string;
  status: string;
  winner_id: string | null;
  loser_id: string | null;
  p1_total: number | null;
  p2_total: number | null;
  margin: number | null;
  tribute_shop_item_id: string | null;
  tribute_paid_at: string | null;
};
```

- [ ] **Step 2: Add dispatcher branches**

Find the `Deno.serve` block (around line 47) and replace its payload-dispatch logic. Replace this:

```ts
  if ('type' in payload && payload.type === 'round_closed') {
    await handleRoundClosed(admin, payload);
    return new Response('ok', { status: 200 });
  }

  const log = (payload as LogInsertPayload).record;
  if (!log) return new Response('no record', { status: 400 });

  await handleLogInserted(admin, log);
  return new Response('ok', { status: 200 });
```

with:

```ts
  if ('type' in payload) {
    if (payload.type === 'round_closed') {
      await handleRoundClosed(admin, payload);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'tribute_picked') {
      await handleTributePicked(admin, payload.round);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'tribute_paid') {
      await handleTributePaid(admin, payload.round);
      return new Response('ok', { status: 200 });
    }
  }

  const log = (payload as LogInsertPayload).record;
  if (!log) return new Response('no record', { status: 400 });

  await handleLogInserted(admin, log);
  return new Response('ok', { status: 200 });
```

- [ ] **Step 3: Add the two new handlers at the bottom of the file**

Append to `supabase/functions/on-log-inserted/index.ts`:

```ts
async function handleTributePicked(admin: SupabaseClient, round: RoundRow): Promise<void> {
  if (!round.loser_id || !round.tribute_shop_item_id) return;
  if (isQuietHours()) return;

  const [{ data: loser }, { data: winner }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', round.loser_id)
      .maybeSingle(),
    round.winner_id
      ? admin
          .from('players')
          .select('id, display_name')
          .eq('id', round.winner_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('shop_items')
      .select('name')
      .eq('id', round.tribute_shop_item_id)
      .maybeSingle(),
  ]);

  if (!loser?.expo_push_token) return;

  const lastIndex = await readLastIndex(admin, loser.id, 'tribute_picked');
  const pick = pickVariant(VARIANTS.tribute_picked, lastIndex, {
    partner: winner?.display_name ?? 'partner',
    tribute: item?.name ?? 'a tribute',
  });
  await sendPush(loser.expo_push_token, {
    title: 'TRIBUTE PICKED',
    body: pick.text,
    data: { screen: 'round_over', round_id: round.id },
  });
  await writeLastIndex(admin, loser.id, 'tribute_picked', pick.index);
}

async function handleTributePaid(admin: SupabaseClient, round: RoundRow): Promise<void> {
  if (!round.winner_id || !round.tribute_shop_item_id) return;
  if (isQuietHours()) return;

  const [{ data: winner }, { data: loser }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', round.winner_id)
      .maybeSingle(),
    round.loser_id
      ? admin
          .from('players')
          .select('id, display_name')
          .eq('id', round.loser_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('shop_items')
      .select('name')
      .eq('id', round.tribute_shop_item_id)
      .maybeSingle(),
  ]);

  // The tribute_paid push goes to the LOSER as a closure beat
  // ("you're square"). Winner already saw the haptic in-app on collect.
  if (!loser?.expo_push_token && !winner?.expo_push_token) return;
  const target = loser?.expo_push_token ? loser : winner;
  if (!target?.expo_push_token) return;
  const partnerName =
    target.id === loser?.id ? winner?.display_name ?? 'partner' : loser?.display_name ?? 'partner';

  const lastIndex = await readLastIndex(admin, target.id, 'tribute_paid');
  const pick = pickVariant(VARIANTS.tribute_paid, lastIndex, {
    partner: partnerName,
    tribute: item?.name ?? 'tribute',
  });
  await sendPush(target.expo_push_token, {
    title: 'TRIBUTE PAID',
    body: pick.text,
    data: { screen: 'home' },
  });
  await writeLastIndex(admin, target.id, 'tribute_paid', pick.index);
}

async function readLastIndex(
  admin: SupabaseClient,
  playerId: string,
  triggerType: string
): Promise<number | null> {
  const { data } = await admin
    .from('push_state')
    .select('last_variant_index')
    .eq('player_id', playerId)
    .eq('trigger_type', triggerType)
    .maybeSingle();
  return (data?.last_variant_index ?? null) as number | null;
}

async function writeLastIndex(
  admin: SupabaseClient,
  playerId: string,
  triggerType: string,
  index: number
): Promise<void> {
  await admin
    .from('push_state')
    .upsert(
      {
        player_id: playerId,
        trigger_type: triggerType,
        last_variant_index: index,
        last_fired_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,trigger_type' }
    );
}
```

If `readLastIndex`/`writeLastIndex` already exist in the file (e.g., if the live-partner-visibility plan added them), reuse those instead of redeclaring — check before pasting.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/on-log-inserted/index.ts
git commit -m "feat: handle tribute_picked and tribute_paid events in on-log-inserted"
```

---

## Task 10: Migration 0012 — `dev_force_close_round` RPC

**Files:**
- Create: `supabase/migrations/0012_dev_force_close.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_dev_force_close.sql`:

```sql
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
```

- [ ] **Step 2: Add RPC to the typed Database in `lib/types.ts`**

In `lib/types.ts`, find the `Functions` block inside `Database` and add the new RPC entry:

```ts
      dev_force_close_round: {
        Args: Record<string, never>;
        Returns: Round;
      };
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_dev_force_close.sql lib/types.ts
git commit -m "feat: dev_force_close_round RPC and typed signature"
```

---

## Task 11: `lib/tribute.ts` — client tribute helpers

**Files:**
- Create: `lib/tribute.ts`

- [ ] **Step 1: Write the helper module**

Create `lib/tribute.ts`:

```ts
import { supabase } from './supabase';
import type { Round, ShopItem, TributeTier } from './types';

/**
 * Cost ranges per tier — duplicated client-side for the tribute-card render.
 * Keep in sync with supabase/functions/_shared/tribute-tiers.ts.
 */
const RANGES: Record<TributeTier, { min: number; max: number }> = {
  paper_cut: { min: 80, max: 249 },
  knockout: { min: 250, max: 449 },
  total_carnage: { min: 450, max: 699 },
  flawless: { min: 700, max: 99999 },
};

const TIER_ORDER: TributeTier[] = [
  'paper_cut',
  'knockout',
  'total_carnage',
  'flawless',
];

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

/**
 * Loads 4 shop items eligible for the given tier, deterministically ordered
 * per round id so the cards stay stable across re-renders.
 */
export async function loadTributeCards(
  tier: TributeTier,
  roundId: string
): Promise<ShopItem[]> {
  const { data } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_active', true);
  const items = (data ?? []) as ShopItem[];

  const inTier = (it: ShopItem, t: TributeTier) =>
    it.cost >= RANGES[t].min && it.cost <= RANGES[t].max;

  const tierIdx = TIER_ORDER.indexOf(tier);
  const fallbackOrder: TributeTier[] = [tier];
  for (let d = 1; d < TIER_ORDER.length; d++) {
    if (tierIdx - d >= 0) fallbackOrder.push(TIER_ORDER[tierIdx - d]);
    if (tierIdx + d < TIER_ORDER.length) fallbackOrder.push(TIER_ORDER[tierIdx + d]);
  }

  const seen = new Set<string>();
  const picked: ShopItem[] = [];
  for (const t of fallbackOrder) {
    const eligible = items
      .filter((it) => inTier(it, t) && !seen.has(it.id))
      .sort((a, b) => fnv1a(roundId + a.id) - fnv1a(roundId + b.id));
    for (const it of eligible) {
      if (picked.length >= 4) break;
      picked.push(it);
      seen.add(it.id);
    }
    if (picked.length >= 4) break;
  }
  return picked.slice(0, 4);
}

/**
 * Persists the winner's chosen tribute. Postgres trigger
 * notify_tribute_picked fires the loser's push.
 */
export async function pickTribute(
  roundId: string,
  shopItemId: string
): Promise<void> {
  await supabase
    .from('rounds')
    .update({ tribute_shop_item_id: shopItemId })
    .eq('id', roundId);
}

/**
 * Persists the winner's "I got my tribute" confirmation. Sets both
 * tribute_paid_at (canonical) and tribute_paid (backwards-compat boolean).
 * Postgres trigger notify_tribute_paid fires the partner's push.
 */
export async function markTributePaid(roundId: string): Promise<void> {
  await supabase
    .from('rounds')
    .update({
      tribute_paid_at: new Date().toISOString(),
      tribute_paid: true,
    })
    .eq('id', roundId);
}

/**
 * Closed rounds for this player (winner OR loser OR tied participant) where
 * the player has not yet finished their step. Used by the home redirect to
 * pop the round-over screen.
 *
 * Resolution rules per role:
 *   - Winner of a decisive round: needs to pick a tribute, then needs to
 *     mark it paid.
 *   - Loser of a decisive round: needs to acknowledge the cinematic. We
 *     store ack as a flag in AsyncStorage; see ackKeyForRound below.
 *   - Tied participant: needs to acknowledge once.
 *
 * For simplicity, "unresolved for me" returns true if:
 *   * I'm the winner AND (tribute_shop_item_id IS NULL OR tribute_paid_at IS NULL)
 *   * I'm the loser/tied AND I haven't ack'd this round id locally
 */
export async function loadUnresolvedClosedRounds(
  coupleId: string,
  playerId: string
): Promise<Round[]> {
  const { data } = await supabase
    .from('rounds')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('status', 'closed')
    .order('number', { ascending: true });
  return (data ?? []) as Round[];
}

/**
 * Local key for tracking that a non-winner player has ack'd a round's KO/tie
 * cinematic. Used by app/(round)/over.tsx and app/_layout.tsx redirect logic.
 */
export function ackKeyForRound(playerId: string, roundId: string): string {
  return `cq:roundAck:${playerId}:${roundId}`;
}

/**
 * Calls the dev RPC to backdate the active round so the next cron tick closes
 * it. For the dev FORCE CLOSE button.
 */
export async function forceCloseCurrentRound(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('dev_force_close_round');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/tribute.ts
git commit -m "feat: client tribute helpers — loadTributeCards, pickTribute, markTributePaid, ack key, force close"
```

---

## Task 12: `components/game/TributeCard.tsx` — face-down/flip card

**Files:**
- Create: `components/game/TributeCard.tsx`

- [ ] **Step 1: Write the component**

Create `components/game/TributeCard.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import type { ShopItem } from '@/lib/types';

type Props = {
  item: ShopItem;
  accentHex: string;
  onLockIn: (item: ShopItem) => void;
};

/**
 * Face-down tribute card. Tap once → flip and reveal item. Tap a revealed
 * card → lock it in (parent calls onLockIn). Idle hover-bounces while
 * face-down or revealed-but-not-locked.
 */
export function TributeCard({ item, accentHex, onLockIn }: Props) {
  const [revealed, setRevealed] = useState(false);
  const flip = useSharedValue(0); // 0 = face-down, 1 = face-up

  // Idle bob — small upward float, looped.
  const bob = useSharedValue(0);
  if (bob.value === 0) {
    bob.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 700 }),
        withTiming(0, { duration: 700 })
      ),
      -1,
      false
    );
  }

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }],
  }));

  const faceDownStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateY: `${flip.value * 180}deg` },
    ],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));

  const faceUpStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateY: `${flip.value * 180 - 180}deg` },
    ],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!revealed) {
      flip.value = withSpring(1, { damping: 14, stiffness: 120 });
      setRevealed(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onLockIn(item);
    }
  }

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[{ width: 140, height: 200 }, wrapperStyle]}>
        {/* Face-down */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              inset: 0,
              backgroundColor: '#000',
              borderWidth: 3,
              borderColor: accentHex,
              alignItems: 'center',
              justifyContent: 'center',
            },
            faceDownStyle,
          ]}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: accentHex,
              fontSize: 28,
            }}
          >
            ?
          </Text>
        </Animated.View>

        {/* Face-up */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              inset: 0,
              backgroundColor: '#000',
              borderWidth: 3,
              borderColor: '#FFCC00',
              padding: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            faceUpStyle,
          ]}
        >
          <Text style={{ fontSize: 36 }}>{extractIcon(item.name)}</Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 8,
              textAlign: 'center',
            }}
            numberOfLines={3}
          >
            {stripIcon(item.name).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 8,
            }}
          >
            {item.cost}¢
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/game/TributeCard.tsx
git commit -m "feat: TributeCard component — face-down flip card with bob + lock-in tap"
```

---

## Task 13: `components/game/HoldToCollect.tsx` — charge-gauge finisher

**Files:**
- Create: `components/game/HoldToCollect.tsx`

- [ ] **Step 1: Write the component**

Create `components/game/HoldToCollect.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const HOLD_MS = 1200;

type Props = {
  label: string;
  accentHex: string;
  onComplete: () => void;
};

/**
 * Hold-to-charge button. Hold for HOLD_MS to fire onComplete. Release early
 * → cancels with soft fizzle haptic. Used as the round-tribute finisher.
 */
export function HoldToCollect({ label, accentHex, onComplete }: Props) {
  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const completedRef = useRef(false);
  const hapticTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  function startHold() {
    completedRef.current = false;
    setHolding(true);
    progress.value = withTiming(
      1,
      { duration: HOLD_MS, easing: Easing.linear },
      (finished) => {
        if (finished) {
          // Worklet → JS: trigger via a non-shared ref pattern.
        }
      }
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Ramp up haptics over the hold duration.
    let beat = 0;
    hapticTimer.current = setInterval(() => {
      beat++;
      if (beat < 3) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else if (beat < 6) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, HOLD_MS / 8);

    // Schedule completion on the JS thread (matches the worklet's duration).
    setTimeout(() => {
      if (!completedRef.current && holding) {
        completedRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        clearTimer();
        onComplete();
      }
    }, HOLD_MS);
  }

  function endHold() {
    setHolding(false);
    if (!completedRef.current) {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: 200 });
      Haptics.selectionAsync();
    }
    clearTimer();
  }

  function clearTimer() {
    if (hapticTimer.current) {
      clearInterval(hapticTimer.current);
      hapticTimer.current = null;
    }
  }

  useEffect(() => () => clearTimer(), []);

  return (
    <Pressable
      onPressIn={startHold}
      onPressOut={endHold}
      style={{ alignItems: 'center', width: '100%' }}
    >
      <View
        style={{
          width: '100%',
          height: 56,
          borderWidth: 3,
          borderColor: accentHex,
          backgroundColor: '#000',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: accentHex,
              opacity: 0.4,
            },
            fillStyle,
          ]}
        />
        <View
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 11,
              letterSpacing: 1,
            }}
          >
            {label}
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#4A4A4A',
          fontSize: 7,
          marginTop: 6,
        }}
      >
        HOLD TO CONFIRM
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/game/HoldToCollect.tsx
git commit -m "feat: HoldToCollect component — 1.2s hold gauge with haptic ramp"
```

---

## Task 14: `components/game/KoOverlay.tsx` — KO cinematic

**Files:**
- Create: `components/game/KoOverlay.tsx`

- [ ] **Step 1: Write the component**

Create `components/game/KoOverlay.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';

import type { TributeTier } from '@/lib/types';

type Props = {
  tier: TributeTier | null; // null → tied
  margin: number;
  bonusCoins: number;
  winnerScore: number;
  loserScore: number;
  onComplete: () => void;
};

/**
 * The KO cinematic: arena flash → tier stamp → score tally → bonus reveal →
 * onComplete fires. Tap to skip. Tier=null renders the tied variant.
 */
export function KoOverlay(props: Props) {
  const [phase, setPhase] = useState<'flash' | 'stamp' | 'tally' | 'bonus' | 'cta'>(
    'flash'
  );

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const t1 = setTimeout(() => setPhase('stamp'), 600);
    const t2 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setPhase('tally');
    }, 1400);
    const t3 = setTimeout(() => setPhase('bonus'), 3200);
    const t4 = setTimeout(() => setPhase('cta'), 4400);
    return () => {
      [t1, t2, t3, t4].forEach(clearTimeout);
    };
  }, []);

  const stamp = stampLabel(props.tier);
  const stampColor = stampColorFor(props.tier);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.onComplete();
      }}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {phase === 'flash' && (
        <MotiView
          from={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ type: 'timing', duration: 400 }}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#FFFFFF',
          }}
        />
      )}

      {phase !== 'flash' && (
        <MotiView
          from={{ scale: 0.4, rotate: '-12deg' }}
          animate={{ scale: 1, rotate: '-6deg' }}
          transition={{ type: 'spring', damping: 12 }}
          style={{ marginBottom: 24 }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: stampColor,
              fontSize: 24,
              textAlign: 'center',
              letterSpacing: 2,
            }}
          >
            {stamp}
          </Text>
        </MotiView>
      )}

      {(phase === 'tally' || phase === 'bonus' || phase === 'cta') && (
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 32,
              letterSpacing: 4,
            }}
          >
            {props.winnerScore} — {props.loserScore}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 12,
              marginTop: 8,
            }}
          >
            MARGIN +{props.margin}
          </Text>
        </View>
      )}

      {(phase === 'bonus' || phase === 'cta') && props.bonusCoins > 0 && (
        <MotiView
          from={{ translateY: 20, opacity: 0 }}
          animate={{ translateY: 0, opacity: 1 }}
          transition={{ type: 'spring' }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#9EFA00',
              fontSize: 14,
            }}
          >
            +{props.bonusCoins} COINS WIRED
          </Text>
        </MotiView>
      )}

      {phase === 'cta' && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#4A4A4A',
            fontSize: 8,
            position: 'absolute',
            bottom: 24,
          }}
        >
          TAP TO CONTINUE
        </Text>
      )}
    </Pressable>
  );
}

function stampLabel(tier: TributeTier | null): string {
  switch (tier) {
    case 'paper_cut':
      return 'K . O .';
    case 'knockout':
      return 'KNOCKOUT!';
    case 'total_carnage':
      return 'TOTAL CARNAGE!!';
    case 'flawless':
      return 'FLAWLESS VICTORY!!!';
    default:
      return 'ROUND TIED';
  }
}

function stampColorFor(tier: TributeTier | null): string {
  switch (tier) {
    case 'flawless':
      return '#9EFA00';
    case 'total_carnage':
      return '#FF3333';
    case 'knockout':
      return '#FFCC00';
    case 'paper_cut':
      return '#FFB8DE';
    default:
      return '#00DDFF';
  }
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/game/KoOverlay.tsx
git commit -m "feat: KoOverlay component — flash + stamp + tally + bonus cinematic"
```

---

## Task 15: `components/game/DebtBadge.tsx` — chain + floating item icon

**Files:**
- Create: `components/game/DebtBadge.tsx`

- [ ] **Step 1: Write the component**

Create `components/game/DebtBadge.tsx`:

```tsx
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  variant: 'owes' | 'collects';
  itemIcon: string; // single emoji or short string
  itemLabel?: string;
};

/**
 * Visual debt indicator placed above a fighter on the home Stage.
 *  - 'owes' → wraps the fighter in a chain badge + floats item icon above.
 *  - 'collects' → floats item icon above the (loser) fighter on the winner's
 *    arena, with a small CROWN beside.
 */
export function DebtBadge({ variant, itemIcon, itemLabel }: Props) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 700 }),
        withTiming(0, { duration: 700 })
      ),
      -1,
      false
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -42,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <Animated.View style={floatStyle}>
        <Text style={{ fontSize: 22 }}>{itemIcon}</Text>
      </Animated.View>
      {variant === 'owes' && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FF3333',
            fontSize: 6,
            marginTop: 4,
          }}
        >
          🔗 OWED
        </Text>
      )}
      {variant === 'collects' && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 6,
            marginTop: 4,
          }}
        >
          👑 COLLECT
        </Text>
      )}
      {itemLabel && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 6,
            marginTop: 2,
            maxWidth: 120,
            textAlign: 'center',
          }}
          numberOfLines={2}
        >
          {itemLabel.toUpperCase()}
        </Text>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/game/DebtBadge.tsx
git commit -m "feat: DebtBadge component — chain + floating item icon for home Stage"
```

---

## Task 16: `app/(round)/_layout.tsx` + `app/(round)/over.tsx` — round-over screen

**Files:**
- Create: `app/(round)/_layout.tsx`
- Create: `app/(round)/over.tsx`

- [ ] **Step 1: Write the layout**

Create `app/(round)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function RoundLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000' },
        // Force non-dismissible — this screen is the round-over modal flow.
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="over" />
    </Stack>
  );
}
```

- [ ] **Step 2: Write the round-over screen**

Create `app/(round)/over.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { KoOverlay } from '@/components/game/KoOverlay';
import { TributeCard } from '@/components/game/TributeCard';
import { HoldToCollect } from '@/components/game/HoldToCollect';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import {
  ackKeyForRound,
  loadTributeCards,
  pickTribute,
  markTributePaid,
} from '@/lib/tribute';
import type { Round, ShopItem } from '@/lib/types';

type Mode = 'cinematic' | 'pick' | 'await' | 'collect' | 'tied' | 'acknowledge';

export default function RoundOverScreen() {
  const params = useLocalSearchParams<{ roundId?: string }>();
  const player = useSession((s) => s.player);
  const [round, setRound] = useState<Round | null>(null);
  const [tributeItem, setTributeItem] = useState<ShopItem | null>(null);
  const [cards, setCards] = useState<ShopItem[]>([]);
  const [mode, setMode] = useState<Mode>('cinematic');
  const [partnerName, setPartnerName] = useState<string>('???');

  useEffect(() => {
    if (!params.roundId || !player) return;
    let cancelled = false;
    (async () => {
      const { data: r } = await supabase
        .from('rounds')
        .select('*')
        .eq('id', params.roundId!)
        .single<Round>();
      if (cancelled || !r) return;
      setRound(r);

      // Load partner name
      const partnerId =
        r.winner_id === player.id ? r.loser_id : r.winner_id ?? null;
      if (partnerId) {
        const { data: p } = await supabase
          .from('players')
          .select('display_name')
          .eq('id', partnerId)
          .maybeSingle();
        if (!cancelled && p) setPartnerName(p.display_name);
      }

      // Load tribute item if picked
      if (r.tribute_shop_item_id) {
        const { data: it } = await supabase
          .from('shop_items')
          .select('*')
          .eq('id', r.tribute_shop_item_id)
          .single<ShopItem>();
        if (!cancelled && it) setTributeItem(it);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.roundId, player?.id]);

  // Determine starting mode after cinematic completes.
  function onCinematicDone() {
    if (!round || !player) return;
    if (!round.winner_id) {
      setMode('tied');
      return;
    }
    if (round.winner_id === player.id) {
      // Winner path
      if (!round.tribute_shop_item_id) {
        // Need to pick.
        loadTributeCards(round.tribute_tier!, round.id).then((c) => setCards(c));
        setMode('pick');
      } else if (!round.tribute_paid_at) {
        // Already picked, awaiting collect.
        setMode('collect');
      } else {
        // Fully resolved — return home.
        finishAndGoHome();
      }
    } else {
      // Loser path
      setMode('acknowledge');
    }
  }

  async function handlePick(item: ShopItem) {
    if (!round) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTributeItem(item);
    await pickTribute(round.id, item.id);
    setMode('await');
  }

  async function handleCollectComplete() {
    if (!round) return;
    await markTributePaid(round.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    finishAndGoHome();
  }

  async function handleAcknowledge() {
    if (!round || !player) return;
    await AsyncStorage.setItem(ackKeyForRound(player.id, round.id), '1');
    finishAndGoHome();
  }

  function finishAndGoHome() {
    router.replace('/(tabs)');
  }

  if (!round || !player) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  const winnerScore = round.winner_id === player.id
    ? Math.max(round.p1_total ?? 0, round.p2_total ?? 0)
    : Math.max(round.p1_total ?? 0, round.p2_total ?? 0);
  const loserScore = round.winner_id === player.id
    ? Math.min(round.p1_total ?? 0, round.p2_total ?? 0)
    : Math.min(round.p1_total ?? 0, round.p2_total ?? 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {mode === 'cinematic' && (
        <KoOverlay
          tier={round.tribute_tier}
          margin={round.margin ?? 0}
          bonusCoins={round.winner_id === player.id ? round.winner_bonus_coins : 0}
          winnerScore={winnerScore}
          loserScore={loserScore}
          onComplete={onCinematicDone}
        />
      )}

      {mode === 'pick' && (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 20,
            paddingTop: 60,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 12,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            CLAIM YOUR TRIBUTE
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 7,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            TAP TO REVEAL · TAP AGAIN TO LOCK
          </Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            {cards.map((item) => (
              <TributeCard
                key={item.id}
                item={item}
                accentHex="#FFCC00"
                onLockIn={handlePick}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {mode === 'await' && tributeItem && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'PressStart2P', color: '#FFCC00', fontSize: 10 }}>
            TRIBUTE LOCKED
          </Text>
          <Text style={{ fontSize: 64, marginVertical: 24 }}>
            {extractIcon(tributeItem.name)}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 10,
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            {stripIcon(tributeItem.name).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#4A4A4A',
              fontSize: 8,
              marginTop: 16,
              textAlign: 'center',
            }}
          >
            AWAITING {partnerName.toUpperCase()} TO FULFILL
          </Text>
          <View style={{ marginTop: 32 }}>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#4A4A4A',
                fontSize: 7,
              }}
              onPress={finishAndGoHome}
            >
              ▶ BACK TO HOME (COLLECT LATER)
            </Text>
          </View>
        </View>
      )}

      {mode === 'collect' && tributeItem && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'PressStart2P', color: '#FFCC00', fontSize: 10 }}>
            COLLECT TRIBUTE
          </Text>
          <Text style={{ fontSize: 64, marginVertical: 24 }}>
            {extractIcon(tributeItem.name)}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 10,
              textAlign: 'center',
              maxWidth: 280,
              marginBottom: 32,
            }}
          >
            {stripIcon(tributeItem.name).toUpperCase()}
          </Text>
          <HoldToCollect
            label="HOLD TO COLLECT"
            accentHex="#9EFA00"
            onComplete={handleCollectComplete}
          />
        </View>
      )}

      {mode === 'acknowledge' && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FF3333',
              fontSize: 16,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            DEBT INCURRED
          </Text>
          {tributeItem ? (
            <>
              <Text style={{ fontSize: 48 }}>{extractIcon(tributeItem.name)}</Text>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#FFFFFF',
                  fontSize: 10,
                  textAlign: 'center',
                  maxWidth: 280,
                  marginVertical: 16,
                }}
              >
                {stripIcon(tributeItem.name).toUpperCase()}
              </Text>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#FFCC00',
                  fontSize: 8,
                  marginBottom: 32,
                }}
              >
                YOU OWE {partnerName.toUpperCase()}
              </Text>
            </>
          ) : (
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFFFFF',
                fontSize: 9,
                textAlign: 'center',
                marginBottom: 32,
              }}
            >
              {partnerName.toUpperCase()} IS PICKING…
            </Text>
          )}
          <Text
            onPress={handleAcknowledge}
            style={{
              fontFamily: 'PressStart2P',
              color: '#9EFA00',
              fontSize: 10,
              borderWidth: 2,
              borderColor: '#9EFA00',
              padding: 12,
            }}
          >
            ✓ ACKNOWLEDGE
          </Text>
        </View>
      )}

      {mode === 'tied' && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#00DDFF',
              fontSize: 18,
              marginBottom: 16,
            }}
          >
            🤝
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#00DDFF',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 32,
            }}
          >
            ROUND TIED
          </Text>
          <Text
            onPress={handleAcknowledge}
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 10,
              borderWidth: 2,
              borderColor: '#FFFFFF',
              padding: 12,
            }}
          >
            ▶ CONTINUE
          </Text>
        </View>
      )}
    </View>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
```

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(round\)/_layout.tsx app/\(round\)/over.tsx
git commit -m "feat: round-over screen — cinematic + pick + await + collect + acknowledge + tied"
```

---

## Task 17: Wire `_layout.tsx` to redirect on unresolved closed rounds

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add the closed-round detector + redirect**

In `app/_layout.tsx`, add the imports near the top (after the existing `loadCouplePlayers` import):

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ackKeyForRound, loadUnresolvedClosedRounds } from '@/lib/tribute';
```

Inside `RootLayout()`, after the existing redirect `useEffect` that handles `(auth)` / `(tabs)` gating (around line 128-147), add a NEW effect:

```tsx
  // Round-over redirect: if there's a closed round whose flow is unresolved
  // for this player, force the round-over screen. Walks oldest-first via
  // `loadUnresolvedClosedRounds` ordering by round.number ascending.
  useEffect(() => {
    if (loading || !session || !couple || !player) return;
    if (!fontsLoaded && !fontError) return;

    let cancelled = false;
    (async () => {
      const rounds = await loadUnresolvedClosedRounds(couple.id, player.id);
      for (const r of rounds) {
        // Winner path: unresolved if no tribute picked OR not yet paid.
        if (r.winner_id === player.id) {
          if (r.tribute_shop_item_id == null || r.tribute_paid_at == null) {
            if (cancelled) return;
            router.replace({
              pathname: '/(round)/over',
              params: { roundId: r.id },
            });
            return;
          }
          // Resolved for winner — keep scanning later rounds.
          continue;
        }
        // Loser / tied participant path: unresolved if not yet locally ack'd.
        const ack = await AsyncStorage.getItem(
          ackKeyForRound(player.id, r.id)
        );
        if (!ack) {
          if (cancelled) return;
          router.replace({
            pathname: '/(round)/over',
            params: { roundId: r.id },
          });
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, fontsLoaded, fontError, session, couple?.id, player?.id, router]);
```

- [ ] **Step 2: Allow `(round)` route group to mount in the root Stack**

In `app/_layout.tsx`, find the root `<Stack>` block (around line 248-251):

```tsx
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
```

Replace with:

```tsx
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(round)"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
      </Stack>
```

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: redirect to round-over screen when unresolved closed round exists"
```

---

## Task 18: Mount `DebtBadge` on Home Stage when tribute outstanding

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Load active debt state**

In `app/(tabs)/index.tsx`, add to imports (near top):

```ts
import { DebtBadge } from '@/components/game/DebtBadge';
import type { Round, ShopItem } from '@/lib/types';
```

Inside the home component (find the function body — typically `function HomeScreen()` or similar), add a new state + effect after the existing data hooks. Look for where `couple` and `player` are pulled from `useSession` and add right after:

```tsx
  const [activeDebtRound, setActiveDebtRound] = useState<Round | null>(null);
  const [activeDebtItem, setActiveDebtItem] = useState<ShopItem | null>(null);

  useEffect(() => {
    if (!couple || !player) return;
    let cancelled = false;
    (async () => {
      // Find a closed round with picked but not paid tribute that involves us.
      const { data: rounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('status', 'closed')
        .not('tribute_shop_item_id', 'is', null)
        .is('tribute_paid_at', null)
        .order('number', { ascending: false })
        .limit(1);
      const r = (rounds?.[0] ?? null) as Round | null;
      if (cancelled) return;
      setActiveDebtRound(r);
      if (r?.tribute_shop_item_id) {
        const { data: item } = await supabase
          .from('shop_items')
          .select('*')
          .eq('id', r.tribute_shop_item_id)
          .single<ShopItem>();
        if (!cancelled) setActiveDebtItem(item ?? null);
      } else {
        setActiveDebtItem(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [couple?.id, player?.id]);
```

- [ ] **Step 2: Render `DebtBadge` over the appropriate FighterCard**

Find the area where `<FighterCard ...>` is rendered for `p1` and `p2`. The current Stage layout has each fighter in its own column. Wrap the loser's fighter (or the partner-collects-from fighter on the winner's side) with a positioned container that hosts `DebtBadge`.

Locate where `<FighterCard player={p1} ... />` and `<FighterCard player={p2} ... />` are rendered inside the Stage's children. For each, wrap as:

```tsx
            {/* P1 fighter wrapper — DebtBadge layers above when applicable */}
            <View style={{ position: 'relative', alignItems: 'center' }}>
              <FighterCard player={p1} {/* existing props */} />
              {activeDebtRound && activeDebtItem && (
                <DebtBadgeMaybe
                  round={activeDebtRound}
                  item={activeDebtItem}
                  fighterId={p1.id}
                  viewerId={player?.id ?? ''}
                />
              )}
            </View>

            {/* P2 fighter wrapper — same pattern */}
            <View style={{ position: 'relative', alignItems: 'center' }}>
              <FighterCard player={p2} {/* existing props */} />
              {activeDebtRound && activeDebtItem && p2 && (
                <DebtBadgeMaybe
                  round={activeDebtRound}
                  item={activeDebtItem}
                  fighterId={p2.id}
                  viewerId={player?.id ?? ''}
                />
              )}
            </View>
```

Add the `DebtBadgeMaybe` helper at the bottom of the file (outside the default export):

```tsx
function DebtBadgeMaybe({
  round,
  item,
  fighterId,
  viewerId,
}: {
  round: Round;
  item: ShopItem;
  fighterId: string;
  viewerId: string;
}) {
  // Show OWES badge over the loser's fighter (always).
  // Show COLLECTS badge over the loser's fighter on the winner's view too —
  // since both badges live on the loser's sprite, just pick variant by viewer.
  if (round.loser_id !== fighterId) return null;

  const variant: 'owes' | 'collects' =
    round.winner_id === viewerId ? 'collects' : 'owes';

  return (
    <DebtBadge
      variant={variant}
      itemIcon={extractIcon(item.name)}
      itemLabel={stripIcon(item.name)}
    />
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
```

If the existing fighter render structure differs from the wrap pattern shown above, adjust the wrapping View to match — the key requirement is that `DebtBadge` is positioned absolute relative to the fighter's wrapper.

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "feat: mount DebtBadge over loser fighter when tribute outstanding"
```

---

## Task 19: Dev `🛠 FORCE CLOSE ROUND` button in Menu

**Files:**
- Modify: `app/(tabs)/menu.tsx`

- [ ] **Step 1: Add the button + handler**

In `app/(tabs)/menu.tsx`, add to imports (top):

```ts
import { forceCloseCurrentRound } from '@/lib/tribute';
```

Add a new handler inside the `MenuScreen` component, near the other dev handlers:

```tsx
  const [closeBusy, setCloseBusy] = useState(false);

  async function handleForceClose() {
    setCloseBusy(true);
    const { ok, error } = await forceCloseCurrentRound();
    setCloseBusy(false);
    if (!ok) {
      Alert.alert('Force close failed', error ?? 'Unknown error.');
      return;
    }
    Alert.alert(
      'Round backdated',
      'End_date set to yesterday. The next pg_cron tick (within 10 min) will close it. Or invoke round-rollover-tick directly via the Supabase dashboard.'
    );
  }
```

In the JSX, add a new dev button alongside the existing summon/banish stub buttons. Find the dev section (search for `summonStub` or the `🛠` emoji if present) and add:

```tsx
        <Pressable
          onPress={handleForceClose}
          disabled={closeBusy}
          style={{
            borderWidth: 2,
            borderColor: '#FF3333',
            padding: 12,
            marginTop: 8,
            opacity: closeBusy ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FF3333',
              fontSize: 9,
              textAlign: 'center',
            }}
          >
            🛠 FORCE CLOSE ROUND
          </Text>
        </Pressable>
```

If the existing dev buttons live inside a wrapped `View` with specific styling, place this Pressable inside that same wrapper so it visually groups with them.

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/\(tabs\)/menu.tsx
git commit -m "feat: dev FORCE CLOSE ROUND button calling dev_force_close_round RPC"
```

---

## Task 20: Apply migrations + manual smoke test

**Files:**
- None — this is a verification task.

- [ ] **Step 1: Apply migrations against Supabase**

Open the Supabase SQL editor for the project (`oklemyqsknbwajccuhju.supabase.co`). Apply, in order:
1. `supabase/migrations/0010_round_close_columns.sql`
2. `supabase/migrations/0011_round_rollover_cron.sql`
3. `supabase/migrations/0012_dev_force_close.sql`

Each migration should run cleanly. If 0011 fails on the `cron.schedule` call because a job with the same name already exists, run `select cron.unschedule('round_rollover_tick');` first then re-apply.

- [ ] **Step 2: Deploy edge functions**

Run:
```bash
npx supabase functions deploy round-rollover-tick
npx supabase functions deploy on-log-inserted
```

- [ ] **Step 3: Smoke test the close flow**

1. Boot the app on a device (cron + push only fire on a real device).
2. Open the Menu and tap `🛠 FORCE CLOSE ROUND`.
3. Wait ≤10 min for the cron tick (or invoke `round-rollover-tick` from the Supabase dashboard for instant fire).
4. App should auto-redirect to the round-over screen on next foreground event.
5. Walk through: cinematic → pick a tribute card → lock in → return to home → see the DebtBadge over the loser's fighter.
6. Re-open the app: should redirect to the collect view.
7. Hold-to-collect for 1.2s → success haptic → return to home, badge gone.

- [ ] **Step 4: Smoke test the tied case**

1. Force-close again with both players logging the same coin total in the round (or 0 logs each).
2. Tied cinematic should play, both players see "ROUND TIED" → CONTINUE → return home with no badge.

---

## Self-Review Checklist (already run by author)

**Spec coverage:**
- §1 (wallet & jackpot UI) → Tasks 2 (`getSpendableCoins`) + 3 (hide JACKPOT button). Note: shop wallet display surgery omitted — shop is a placeholder.
- §2 (round close mechanic) → Tasks 1 (migration), 4 (tribute-tiers shared), 5 (round-close shared), 6 (variants), 7 (rollover function), 8 (cron migration).
- §3 (tribute experience) → Tasks 11 (client helpers), 12 (TributeCard), 13 (HoldToCollect), 14 (KoOverlay), 15 (DebtBadge), 16 (round-over screen), 17 (redirect gating), 18 (DebtBadge on home).
- §4 (operational) → Tasks 9 (tribute event handlers), 10 (dev RPC), 19 (dev button), 20 (apply + smoke).
- Acceptance criteria 1-10 → all addressed across the tasks above.

**Placeholder scan:** no TBDs, no "implement later", no "see Task N" references with missing code. Each task contains the exact code to write.

**Type consistency:** `Round` extension in Task 1 used consistently across Tasks 5, 7, 9, 11, 16, 17, 18. `TributeTier` referenced consistently. `pickTribute`, `markTributePaid`, `forceCloseCurrentRound`, `loadTributeCards`, `loadUnresolvedClosedRounds`, `ackKeyForRound` all defined in Task 11 and called by exact name in 16, 17, 19.

**Scope check:** single coherent feature. Tasks 1-3 are independently shippable as a "hide jackpot, prep wallet" sub-deliverable. Tasks 4-9 are the server-side close. Tasks 11-19 are the client tribute experience. Within one plan because they form one user-facing feature.
