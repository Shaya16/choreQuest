# Debt Debuff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a player has any unresolved debt older than 24h, new logs earn 50% coins. Add an Amnesty flow for purchase tokens at 1.5× cost (tributes excluded). XP and round competition are untouched.

**Architecture:** Single forward-only migration adds `amnesty_fees` table + `purchases.cancelled_via` column + `purchase_amnesty` RPC. A new pure-TS module `lib/debt.ts` computes debt state from existing rows. `computeLogValues` in `lib/logger.ts` takes a new `debtMultiplier` param, applied at the end of the coin formula (not round_value, not xp). UI adds a `DebtChip`, `DebtModal`, `AmnestyConfirmModal`, halved log-confirm preview, coin-drop scaling, WalletHUD chain icon, and a Shop "WHAT YOU OWE" section.

**Tech Stack:** Expo SDK 52 + React Native, TypeScript, Supabase (Postgres + Edge Functions + RPC), Zustand, Reanimated/Moti, Deno (for edge function tests).

**Dependencies / Sequencing:**
- In-flight work on `components/game/DebtBadge.tsx` + `FighterCard.tsx` + `app/(tabs)/index.tsx` (from `2026-04-20-tribute-debt-loser-anchor-design.md`) must be **committed or stashed** before Task 14 (Home wiring). The other tasks are independent.
- Migration number `0020` assumes `0019_dev_stub_incoming_deploy.sql` stays put. If renumbered, bump this plan's migration.

---

## File Structure

**New files:**
- `supabase/migrations/0020_debt_amnesty.sql` — amnesty_fees table, cancelled_via column, purchase_amnesty RPC
- `lib/debt.ts` — pure-TS debt state derivation
- `tests/lib/debt.test.ts` — unit tests
- `tests/lib/logger.test.ts` — debt-aware coin-math tests (new file if none exists)
- `components/ui/DebtChip.tsx` — red "🔒 IN DEBT" chip
- `components/game/DebtModal.tsx` — list of debts with actions
- `components/game/AmnestyConfirmModal.tsx` — confirm amnesty + call RPC
- `supabase/functions/_shared/amnesty.test.ts` — Deno tests for RPC (if tested via edge function harness; otherwise direct SQL tests)

**Modified files:**
- `lib/wallet.ts` — `getSpendableCoins` subtracts amnesty_fees
- `lib/logger.ts` — `computeLogValues` adds `debtMultiplier` param; `createLog` passes it through
- `lib/types.ts` — add `cancelled_via`, amnesty_fees row type
- `lib/shop.ts` — add `cancelPurchaseViaAmnesty(purchaseId)` helper wrapping the RPC
- `lib/notifications.ts` — add variant template for amnesty push (if variant pool lives here) OR `supabase/functions/_shared/` variant-picker
- `components/game/WalletHUD.tsx` — chain icon overlay
- `components/game/CoinDropAnimation.tsx` — debt scaling (location TBD; may be inline in log flow)
- `app/(tabs)/index.tsx` — wire `DebtChip` onto each FighterCard, wire `DebtModal` on tap
- `app/(tabs)/shop.tsx` — add "WHAT YOU OWE" section above catalog
- The log-confirm surface (`components/game/StrikeDrawer.tsx` per session 3 STATE, or wherever MoveCard is confirmed) — halved preview

---

## Task 1: Migration — schema

**Files:**
- Create: `supabase/migrations/0020_debt_amnesty.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 0020: Debt debuff — amnesty fee infrastructure.
-- Adds a cancelled_via audit column on purchases and a new amnesty_fees
-- ledger table that getSpendableCoins queries to deduct the fee from
-- the target who bought amnesty. No breaking changes to existing columns.

BEGIN;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS cancelled_via TEXT
  CHECK (cancelled_via IN ('amnesty', 'buyer_cancel') OR cancelled_via IS NULL);

CREATE TABLE IF NOT EXISTS amnesty_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  payer_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  amount INT NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amnesty_fees_payer_id_idx
  ON amnesty_fees(payer_id);

CREATE INDEX IF NOT EXISTS amnesty_fees_purchase_id_idx
  ON amnesty_fees(purchase_id);

-- RLS: a player can read amnesty_fees where payer is in their couple.
ALTER TABLE amnesty_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY amnesty_fees_read ON amnesty_fees
  FOR SELECT
  USING (
    payer_id IN (
      SELECT p.id FROM players p
      WHERE p.couple_id = (
        SELECT couple_id FROM players WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy — only the purchase_amnesty RPC
-- (SECURITY DEFINER) writes to this table.

COMMIT;
```

- [ ] **Step 2: Apply the migration locally**

```bash
cd chore-quest && supabase db push
```

Expected: no errors; migration `0020_debt_amnesty.sql` appears in applied list.

- [ ] **Step 3: Verify schema**

```bash
supabase db execute "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='purchases' AND column_name='cancelled_via';"
supabase db execute "SELECT table_name FROM information_schema.tables WHERE table_name='amnesty_fees';"
```

Expected: both queries return a row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_debt_amnesty.sql
git commit -m "feat(db): add cancelled_via + amnesty_fees ledger (0020)"
```

---

## Task 2: Migration — purchase_amnesty RPC

**Files:**
- Modify: `supabase/migrations/0020_debt_amnesty.sql`

- [ ] **Step 1: Append the RPC to the migration**

Append this to `supabase/migrations/0020_debt_amnesty.sql` **before** the final `COMMIT;` (or create a new migration `0021_purchase_amnesty_rpc.sql` if `0020` is already deployed):

```sql
CREATE OR REPLACE FUNCTION public.purchase_amnesty(p_purchase_id UUID)
RETURNS TABLE(
  fee INT,
  refund INT,
  target_spendable INT,
  buyer_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase purchases%ROWTYPE;
  v_item     shop_items%ROWTYPE;
  v_caller_player_id UUID;
  v_fee INT;
  v_spendable INT;
BEGIN
  -- Resolve caller → players.id
  SELECT id INTO v_caller_player_id
    FROM players
    WHERE user_id = auth.uid()
    LIMIT 1;
  IF v_caller_player_id IS NULL THEN
    RAISE EXCEPTION 'no_player_for_auth_user';
  END IF;

  -- Lock the purchase row for the transaction
  SELECT * INTO v_purchase
    FROM purchases
    WHERE id = p_purchase_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_not_found';
  END IF;

  IF v_purchase.target_id <> v_caller_player_id THEN
    RAISE EXCEPTION 'not_target';
  END IF;

  IF v_purchase.status NOT IN ('pending', 'redemption_requested') THEN
    RAISE EXCEPTION 'purchase_not_open';
  END IF;

  SELECT * INTO v_item
    FROM shop_items
    WHERE id = v_purchase.shop_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_item_not_found';
  END IF;

  v_fee := ceil(v_item.cost * 1.5)::INT;

  -- Compute caller's spendable coins inline (mirrors lib/wallet.ts::getSpendableCoins)
  SELECT COALESCE(SUM(l.personal_share + l.jackpot_share), 0)::INT
       + COALESCE((SELECT SUM(r.winner_bonus_coins) FROM rounds r WHERE r.winner_id = v_caller_player_id), 0)::INT
       - COALESCE((SELECT SUM(si.cost)
                     FROM purchases p
                     JOIN shop_items si ON si.id = p.shop_item_id
                     WHERE p.buyer_id = v_caller_player_id
                       AND p.status <> 'cancelled'), 0)::INT
       - COALESCE((SELECT SUM(af.amount) FROM amnesty_fees af WHERE af.payer_id = v_caller_player_id), 0)::INT
    INTO v_spendable
    FROM logs l
    WHERE l.player_id = v_caller_player_id;

  IF v_spendable < v_fee THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  -- Write the ledger entry and cancel the purchase atomically
  INSERT INTO amnesty_fees (purchase_id, payer_id, amount)
    VALUES (p_purchase_id, v_caller_player_id, v_fee);

  UPDATE purchases
     SET status = 'cancelled',
         cancelled_via = 'amnesty',
         redeemed_at = now()
   WHERE id = p_purchase_id;

  RETURN QUERY SELECT
    v_fee AS fee,
    v_item.cost AS refund,
    (v_spendable - v_fee) AS target_spendable,
    v_purchase.buyer_id AS buyer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_amnesty(UUID) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
cd chore-quest && supabase db push
```

Expected: migration applied without error.

- [ ] **Step 3: Smoke-test the RPC against the local DB**

```bash
supabase db execute "SELECT * FROM purchase_amnesty('00000000-0000-0000-0000-000000000000');"
```

Expected: error `purchase_not_found` (proving the RPC is callable and reaches the lookup).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_debt_amnesty.sql
git commit -m "feat(db): purchase_amnesty RPC with inline spendable check"
```

---

## Task 3: Wire amnesty fees into getSpendableCoins

**Files:**
- Modify: `lib/wallet.ts`

- [ ] **Step 1: Add the amnesty fee subtraction**

Replace the body of `getSpendableCoins` in `lib/wallet.ts` with:

```ts
export async function getSpendableCoins(playerId: string): Promise<number> {
  const [
    { data: logs },
    { data: bonuses },
    { data: purchases },
    { data: amnestyFees },
  ] = await Promise.all([
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
    supabase
      .from('amnesty_fees')
      .select('amount')
      .eq('payer_id', playerId),
  ]);

  const earned = (logs ?? []).reduce(
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

  const amnestySpent = (amnestyFees ?? []).reduce(
    (acc, f) => acc + (f.amount ?? 0),
    0
  );

  return earned + bonus - spent - amnestySpent;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/wallet.ts
git commit -m "feat(wallet): subtract amnesty_fees from spendable coins"
```

---

## Task 4: lib/debt.ts — types and pure function

**Files:**
- Create: `lib/debt.ts`

- [ ] **Step 1: Write the module**

```ts
// lib/debt.ts — pure-TS debt state derivation.
// ZERO React imports; unit-testable in Node (constraint 5).

import type { Purchase, Round } from './types';

export type DebtSource =
  | {
      kind: 'purchase';
      purchase_id: string;
      shop_item_id: string;
      cost: number;
      purchased_at: string;
      age_ms: number;
    }
  | {
      kind: 'tribute';
      round_id: string;
      tribute_shop_item_id: string | null;
      end_date: string;
      age_ms: number;
    };

export type DebtState = {
  inDebt: boolean;          // at least one source older than 24h (grace)
  debtMultiplier: 0.5 | 1.0;
  sources: DebtSource[];    // all open debts, newest-first (for UI listing)
  activeSources: DebtSource[]; // subset older than 24h (what triggers debuff)
};

const GRACE_MS = 24 * 60 * 60 * 1000;

export function computeDebtState(args: {
  playerId: string;
  coupleId: string;
  purchases: Purchase[];
  rounds: Round[];
  now: Date;
}): DebtState {
  const { playerId, coupleId, purchases, rounds, now } = args;
  const nowMs = now.getTime();

  const sources: DebtSource[] = [];

  // 1) Pending purchase tokens where this player is target.
  for (const p of purchases) {
    if (p.target_id !== playerId) continue;
    if (p.status !== 'pending' && p.status !== 'redemption_requested') continue;
    const purchasedMs = new Date(p.purchased_at).getTime();
    sources.push({
      kind: 'purchase',
      purchase_id: p.id,
      shop_item_id: p.shop_item_id,
      cost: 0, // cost resolved by caller if needed; set elsewhere to keep this pure
      purchased_at: p.purchased_at,
      age_ms: Math.max(0, nowMs - purchasedMs),
    });
  }

  // 2) Unpaid tribute from a closed round where this player lost.
  for (const r of rounds) {
    if (r.couple_id !== coupleId) continue;
    if (r.status !== 'closed') continue; // 'inactive' rounds don't fire tribute
    if (!r.winner_id) continue;           // ties have no loser
    if (r.winner_id === playerId) continue;
    if (r.tribute_paid) continue;
    if (!r.end_date) continue;
    const endMs = new Date(`${r.end_date}T23:59:59Z`).getTime();
    sources.push({
      kind: 'tribute',
      round_id: r.id,
      tribute_shop_item_id: r.tribute_shop_item_id ?? null,
      end_date: r.end_date,
      age_ms: Math.max(0, nowMs - endMs),
    });
  }

  // Sort newest first for UI display.
  sources.sort((a, b) => a.age_ms - b.age_ms);

  const activeSources = sources.filter((s) => s.age_ms >= GRACE_MS);
  const inDebt = activeSources.length > 0;

  return {
    inDebt,
    debtMultiplier: inDebt ? 0.5 : 1.0,
    sources,
    activeSources,
  };
}
```

- [ ] **Step 2: Verify `Purchase` and `Round` types have the fields referenced**

```bash
grep -n "status\|target_id\|purchased_at\|tribute_paid\|tribute_shop_item_id\|winner_id\|couple_id\|end_date" lib/types.ts | head -30
```

Expected: lines present. If `tribute_shop_item_id` is missing from `Round`, add it (the in-flight work already references it).

- [ ] **Step 3: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/debt.ts lib/types.ts
git commit -m "feat(debt): pure-TS computeDebtState helper"
```

---

## Task 5: Tests for lib/debt.ts

**Files:**
- Create: `tests/lib/debt.test.ts`

- [ ] **Step 1: Check which test framework is wired**

```bash
cd chore-quest && cat package.json | grep -E '"(test|jest|vitest)"' | head
ls tests/ 2>/dev/null
```

If no JS test framework is wired (per session 3 STATE: "the project has no JS test framework wired up"), **skip this task** and rely on `tsc` + edge-function Deno tests + manual smoke instead. Mark the task complete with a note.

- [ ] **Step 2: If a framework IS wired, write tests**

```ts
// tests/lib/debt.test.ts
import { computeDebtState } from '../../lib/debt';

const playerId = 'p1';
const coupleId = 'c1';
const otherPlayer = 'p2';

const now = new Date('2026-04-20T12:00:00Z');
const h25ago = new Date('2026-04-19T11:00:00Z').toISOString();
const h10ago = new Date('2026-04-20T02:00:00Z').toISOString();

describe('computeDebtState', () => {
  it('returns inDebt=false with no debts', () => {
    const s = computeDebtState({ playerId, coupleId, purchases: [], rounds: [], now });
    expect(s.inDebt).toBe(false);
    expect(s.debtMultiplier).toBe(1.0);
    expect(s.activeSources).toHaveLength(0);
  });

  it('ignores purchase debts younger than 24h (grace)', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [{ id: 'pu1', target_id: playerId, buyer_id: otherPlayer, shop_item_id: 's1', status: 'pending', purchased_at: h10ago } as any],
      rounds: [],
      now,
    });
    expect(s.inDebt).toBe(false);
    expect(s.sources).toHaveLength(1);        // shown in UI
    expect(s.activeSources).toHaveLength(0);  // but doesn't trigger
  });

  it('triggers on purchase debts older than 24h', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [{ id: 'pu2', target_id: playerId, buyer_id: otherPlayer, shop_item_id: 's1', status: 'pending', purchased_at: h25ago } as any],
      rounds: [],
      now,
    });
    expect(s.inDebt).toBe(true);
    expect(s.debtMultiplier).toBe(0.5);
  });

  it('ignores purchase debts targeting someone else', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [{ id: 'pu3', target_id: otherPlayer, buyer_id: playerId, shop_item_id: 's1', status: 'pending', purchased_at: h25ago } as any],
      rounds: [],
      now,
    });
    expect(s.inDebt).toBe(false);
  });

  it('ignores cancelled/redeemed purchases', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [
        { id: 'pu4', target_id: playerId, buyer_id: otherPlayer, shop_item_id: 's1', status: 'cancelled', purchased_at: h25ago } as any,
        { id: 'pu5', target_id: playerId, buyer_id: otherPlayer, shop_item_id: 's1', status: 'redeemed', purchased_at: h25ago } as any,
      ],
      rounds: [],
      now,
    });
    expect(s.inDebt).toBe(false);
  });

  it('treats redemption_requested as still-owed', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [{ id: 'pu6', target_id: playerId, buyer_id: otherPlayer, shop_item_id: 's1', status: 'redemption_requested', purchased_at: h25ago } as any],
      rounds: [],
      now,
    });
    expect(s.inDebt).toBe(true);
  });

  it('triggers on unpaid tribute from a closed round where player lost', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [],
      rounds: [{ id: 'r1', couple_id: coupleId, status: 'closed', winner_id: otherPlayer, tribute_paid: false, end_date: '2026-04-18', tribute_shop_item_id: 's1' } as any],
      now,
    });
    expect(s.inDebt).toBe(true);
  });

  it('ignores rounds with status=inactive (dead round)', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [],
      rounds: [{ id: 'r2', couple_id: coupleId, status: 'inactive', winner_id: otherPlayer, tribute_paid: false, end_date: '2026-04-18' } as any],
      now,
    });
    expect(s.inDebt).toBe(false);
  });

  it('ignores tied rounds (winner_id NULL)', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [],
      rounds: [{ id: 'r3', couple_id: coupleId, status: 'closed', winner_id: null, tribute_paid: false, end_date: '2026-04-18' } as any],
      now,
    });
    expect(s.inDebt).toBe(false);
  });

  it('ignores rounds where player WON', () => {
    const s = computeDebtState({
      playerId, coupleId,
      purchases: [],
      rounds: [{ id: 'r4', couple_id: coupleId, status: 'closed', winner_id: playerId, tribute_paid: false, end_date: '2026-04-18' } as any],
      now,
    });
    expect(s.inDebt).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test tests/lib/debt.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/debt.test.ts
git commit -m "test(debt): computeDebtState matrix"
```

---

## Task 6: computeLogValues — debtMultiplier param (merged with callers)

**Files:**
- Modify: `lib/logger.ts`

**Why merged:** `computeLogValues` is called by `createLog` in the same file. Adding a required param breaks the caller — must update both in one commit (session 3 pattern: `Log.Insert = Omit<Log, 'id'|'logged_at'>` propagation).

- [ ] **Step 1: Update `computeLogValues` signature and math**

In `lib/logger.ts`, replace `computeLogValues` with:

```ts
export function computeLogValues(
  activity: Activity,
  player: Player,
  debtMultiplier: 1.0 | 0.5 = 1.0
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

  // Coins are halved when the player is debuffed. XP and round_value are NOT.
  const coins = Math.max(0, Math.floor(rawBase * multTotal * debtMultiplier));
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
    xp_earned: rawBase,       // unchanged — XP ignores debt
    jackpot_share: 0,         // matches existing behavior (no split in v1)
    personal_share: coins,
    round_value_earned: roundValue, // unchanged — round competition protected
  };
}
```

- [ ] **Step 2: Update `createLog` to accept and forward `debtMultiplier`**

Replace `createLog` in `lib/logger.ts` with:

```ts
export async function createLog(args: {
  activity: Activity;
  player: Player;
  roundId: string;
  debtMultiplier?: 1.0 | 0.5;
}): Promise<Log | null> {
  const values = computeLogValues(
    args.activity,
    args.player,
    args.debtMultiplier ?? 1.0
  );
  const { data, error } = await supabase
    .from('logs')
    .insert({
      player_id: args.player.id,
      activity_id: args.activity.id,
      round_id: args.roundId,
      evidence_url: null,
      notes: null,
      ...values,
    })
    .select('*')
    .single<Log>();
  if (error) {
    console.warn('createLog failed', error);
    return null;
  }
  return data;
}
```

- [ ] **Step 3: Find every caller of `createLog` and pass `debtMultiplier`**

```bash
grep -rn "createLog(" app/ components/ lib/ --include="*.ts" --include="*.tsx"
```

For each caller, update the call to pass `debtMultiplier` from the caller's `useDebtState` hook (introduced in Task 8). If a caller doesn't yet have access to `debtMultiplier`, pass `1.0` explicitly — wiring happens in Task 8 onward.

- [ ] **Step 4: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0. (`debtMultiplier` is optional with default 1.0, so existing callers compile unchanged.)

- [ ] **Step 5: Commit**

```bash
git add lib/logger.ts
git commit -m "feat(logger): computeLogValues debtMultiplier param (coins-only halving)"
```

---

## Task 7: Tests for computeLogValues with debt

**Files:**
- Create: `tests/lib/logger.test.ts` (skip if no JS test framework — see Task 5 Step 1)

- [ ] **Step 1: Write tests**

```ts
// tests/lib/logger.test.ts
import { computeLogValues } from '../../lib/logger';
import type { Activity, Player } from '../../lib/types';

const activity: Activity = {
  id: 'a1', world: 'gym', tier: null, name: 'Gym session', description: null,
  base_value: 30, bonus: 0, daily_cap: 1, requires_photo: false,
  icon_sprite: null, is_custom: false, created_by_couple_id: null,
  is_active: true, round_value: 10, archived_at: null,
} as any;

const player: Player = {
  id: 'p1', user_id: 'u1', couple_id: 'c1', display_name: 'P1',
  arcade_class: 'gym_fighter', avatar_sprite: '',
  mult_gym: 1.0, mult_aerobics: 1.0, mult_university: 1.0,
  mult_diet: 1.0, mult_household: 1.0, mult_reading: 1.0,
  current_combo_days: 0, combo_multiplier: 1.0, freezes_remaining: 2,
  last_log_date: null, lifetime_score: 0, personal_wallet: 0,
  lifetime_xp: 0, player_level: 1, current_title: 'Rookie',
  crowns: {} as any, belts: 0, instant_win_tokens: 0, upgrades: [],
} as any;

describe('computeLogValues with debtMultiplier', () => {
  it('default (no debt): coins = base × mults, xp = base, round_value untouched', () => {
    const r = computeLogValues(activity, player);
    expect(r.coins_earned).toBe(30);
    expect(r.xp_earned).toBe(30);
    expect(r.round_value_earned).toBe(10);
  });

  it('debt 0.5: coins halved, xp unchanged, round_value unchanged', () => {
    const r = computeLogValues(activity, player, 0.5);
    expect(r.coins_earned).toBe(15);
    expect(r.xp_earned).toBe(30);       // XP NEVER halves
    expect(r.round_value_earned).toBe(10); // round competition NEVER halves
  });

  it('debt with combo 1.5: coins = floor(30 × 1.5 × 0.5) = 22', () => {
    const p = { ...player, combo_multiplier: 1.5 } as Player;
    const r = computeLogValues(activity, p, 0.5);
    expect(r.coins_earned).toBe(22);
    expect(r.xp_earned).toBe(30);
  });

  it('personal_share matches halved coins (no split in v1)', () => {
    const r = computeLogValues(activity, player, 0.5);
    expect(r.personal_share).toBe(r.coins_earned);
    expect(r.jackpot_share).toBe(0);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test tests/lib/logger.test.ts`
Expected: 4/4 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/logger.test.ts
git commit -m "test(logger): debtMultiplier halves coins, not xp/round_value"
```

---

## Task 8: useDebtState hook

**Files:**
- Create: `lib/useDebtState.ts`

- [ ] **Step 1: Write the hook**

```ts
// lib/useDebtState.ts — React hook that queries purchases + rounds
// and derives DebtState via the pure lib/debt.ts helper.
//
// Refreshes on window focus (handled by callers invoking refetch()) and
// on a timer (so the 24h-grace boundary flips without a manual reload).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { computeDebtState, type DebtState } from './debt';
import type { Purchase, Round } from './types';

const EMPTY: DebtState = {
  inDebt: false,
  debtMultiplier: 1.0,
  sources: [],
  activeSources: [],
};

export function useDebtState(
  playerId: string | null,
  coupleId: string | null
): { state: DebtState; refetch: () => Promise<void>; loading: boolean } {
  const [state, setState] = useState<DebtState>(EMPTY);
  const [loading, setLoading] = useState<boolean>(false);

  const refetch = useCallback(async () => {
    if (!playerId || !coupleId) {
      setState(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const [{ data: purchases }, { data: rounds }] = await Promise.all([
        supabase
          .from('purchases')
          .select('*')
          .eq('target_id', playerId)
          .in('status', ['pending', 'redemption_requested']),
        supabase
          .from('rounds')
          .select('*')
          .eq('couple_id', coupleId)
          .eq('status', 'closed')
          .neq('winner_id', playerId)
          .eq('tribute_paid', false),
      ]);
      const s = computeDebtState({
        playerId,
        coupleId,
        purchases: (purchases ?? []) as Purchase[],
        rounds: (rounds ?? []) as Round[],
        now: new Date(),
      });
      setState(s);
    } finally {
      setLoading(false);
    }
  }, [playerId, coupleId]);

  useEffect(() => {
    void refetch();
    // Re-check every 5 minutes so the 24h grace boundary flips without
    // requiring a user refresh.
    const t = setInterval(() => void refetch(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refetch]);

  return { state, refetch, loading };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/useDebtState.ts
git commit -m "feat(debt): useDebtState hook (purchases + rounds → DebtState)"
```

---

## Task 9: DebtChip component

**Files:**
- Create: `components/ui/DebtChip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/ui/DebtChip.tsx — red "🔒 IN DEBT · 50% COINS" chip.
// Renders when a player has ≥1 active debt (>24h).

import { Pressable, Text, View } from 'react-native';

export type DebtChipProps = {
  onPress?: () => void;
};

export function DebtChip({ onPress }: DebtChipProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        paddingHorizontal: 6,
        paddingVertical: 3,
        backgroundColor: '#FF3333',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        borderRadius: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 8, color: '#FFFFFF' }}>🔒</Text>
      <Text
        style={{
          fontFamily: 'PressStart2P',
          fontSize: 7,
          color: '#FFFFFF',
          letterSpacing: 1,
        }}
      >
        IN DEBT · 50% COINS
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/ui/DebtChip.tsx
git commit -m "feat(ui): DebtChip component (red IN DEBT pill)"
```

---

## Task 10: DebtModal component

**Files:**
- Create: `components/game/DebtModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// components/game/DebtModal.tsx — lists open debts with action buttons.
// Action visibility depends on whether the viewer IS the debtor.

import { Modal, Pressable, Text, View, ScrollView } from 'react-native';
import type { DebtState, DebtSource } from '../../lib/debt';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ShopItem } from '../../lib/types';

type ItemLookup = Record<string, { name: string; cost: number; icon_sprite: string | null }>;

export type DebtModalProps = {
  visible: boolean;
  onClose: () => void;
  debt: DebtState;
  viewerIsDebtor: boolean; // if false → read-only (partner viewing other's debt)
  onPay?: (src: DebtSource) => void;      // deep-link to redeem/mark-paid
  onAmnesty?: (src: Extract<DebtSource, { kind: 'purchase' }>) => void;
};

export function DebtModal(props: DebtModalProps) {
  const { visible, onClose, debt, viewerIsDebtor, onPay, onAmnesty } = props;
  const [items, setItems] = useState<ItemLookup>({});

  const neededIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of debt.sources) {
      if (s.kind === 'purchase') ids.add(s.shop_item_id);
      if (s.kind === 'tribute' && s.tribute_shop_item_id) ids.add(s.tribute_shop_item_id);
    }
    return Array.from(ids);
  }, [debt.sources]);

  useEffect(() => {
    if (neededIds.length === 0) {
      setItems({});
      return;
    }
    let cancelled = false;
    supabase
      .from('shop_items')
      .select('id, name, cost, icon_sprite')
      .in('id', neededIds)
      .then(({ data }) => {
        if (cancelled) return;
        const map: ItemLookup = {};
        for (const it of (data ?? []) as ShopItem[]) {
          map[it.id] = { name: it.name, cost: it.cost, icon_sprite: it.icon_sprite ?? null };
        }
        setItems(map);
      });
    return () => { cancelled = true; };
  }, [neededIds]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#000',
            borderWidth: 3,
            borderColor: '#FF3333',
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 10, color: '#FF3333', letterSpacing: 1 }}>
            {viewerIsDebtor ? 'YOU OWE' : 'THEY OWE'}
          </Text>

          <ScrollView style={{ maxHeight: 320 }}>
            {debt.sources.length === 0 && (
              <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#4A4A4A' }}>
                NOTHING OPEN
              </Text>
            )}
            {debt.sources.map((src) => {
              const past24h = src.age_ms >= 24 * 60 * 60 * 1000;
              if (src.kind === 'purchase') {
                const item = items[src.shop_item_id];
                const name = item?.name ?? 'TOKEN';
                const cost = item?.cost ?? 0;
                const fee = Math.ceil(cost * 1.5);
                return (
                  <View key={src.purchase_id} style={{ borderBottomWidth: 1, borderBottomColor: '#4A4A4A', paddingVertical: 8, gap: 4 }}>
                    <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: past24h ? '#FF3333' : '#FFCC00' }}>
                      {name.toUpperCase()}
                    </Text>
                    <Text style={{ fontFamily: 'PressStart2P', fontSize: 6, color: '#4A4A4A' }}>
                      {formatAge(src.age_ms)}
                    </Text>
                    {viewerIsDebtor && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <Pressable onPress={() => onPay?.(src)} style={btn('#00DDFF')}>
                          <Text style={btnText('#000')}>PAY</Text>
                        </Pressable>
                        <Pressable onPress={() => onAmnesty?.(src)} style={btn('#FFA63F')}>
                          <Text style={btnText('#000')}>AMNESTY · {fee}¢</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              }
              // tribute
              return (
                <View key={src.round_id} style={{ borderBottomWidth: 1, borderBottomColor: '#4A4A4A', paddingVertical: 8, gap: 4 }}>
                  <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: past24h ? '#FF3333' : '#FFCC00' }}>
                    TRIBUTE — {items[src.tribute_shop_item_id ?? '']?.name.toUpperCase() ?? 'NOT PICKED'}
                  </Text>
                  <Text style={{ fontFamily: 'PressStart2P', fontSize: 6, color: '#4A4A4A' }}>
                    {formatAge(src.age_ms)}
                  </Text>
                  {viewerIsDebtor && (
                    <Pressable onPress={() => onPay?.(src)} style={[btn('#00DDFF'), { marginTop: 4, alignSelf: 'flex-start' }]}>
                      <Text style={btnText('#000')}>MARK PAID</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable onPress={onClose} style={{ alignSelf: 'flex-end' }}>
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>CLOSE</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatAge(ms: number): string {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'JUST NOW';
  if (h < 24) return `${h}H`;
  const d = Math.floor(h / 24);
  return `${d}D ${h % 24}H`;
}

function btn(bg: string) {
  return { backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4 };
}
function btnText(color: string) {
  return { fontFamily: 'PressStart2P', fontSize: 7, color };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/game/DebtModal.tsx
git commit -m "feat(debt): DebtModal — list open debts with PAY/AMNESTY actions"
```

---

## Task 11: AmnestyConfirmModal + RPC wiring

**Files:**
- Create: `components/game/AmnestyConfirmModal.tsx`
- Modify: `lib/shop.ts`

- [ ] **Step 1: Add RPC helper to lib/shop.ts**

Append to `lib/shop.ts`:

```ts
export type AmnestyResult = {
  fee: number;
  refund: number;
  target_spendable: number;
  buyer_id: string;
};

export async function purchaseAmnesty(
  purchaseId: string
): Promise<{ ok: true; result: AmnestyResult } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('purchase_amnesty', {
    p_purchase_id: purchaseId,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: 'no_result' };
  return { ok: true, result: row as AmnestyResult };
}
```

- [ ] **Step 2: Write the confirm modal**

```tsx
// components/game/AmnestyConfirmModal.tsx

import { Modal, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { purchaseAmnesty } from '../../lib/shop';

export type AmnestyConfirmModalProps = {
  visible: boolean;
  purchaseId: string | null;
  itemName: string;
  itemCost: number;
  spendable: number;
  onClose: () => void;
  onResolved: () => void; // caller refetches debt state + wallet
};

export function AmnestyConfirmModal(props: AmnestyConfirmModalProps) {
  const { visible, purchaseId, itemName, itemCost, spendable, onClose, onResolved } = props;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fee = Math.ceil(itemCost * 1.5);
  const insufficient = spendable < fee;

  async function confirm() {
    if (!purchaseId) return;
    setSubmitting(true);
    setError(null);
    const r = await purchaseAmnesty(purchaseId);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onResolved();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#000', borderWidth: 3, borderColor: '#FFA63F', padding: 16, gap: 10 }}>
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 10, color: '#FFA63F' }}>
            CANCEL "{itemName.toUpperCase()}"?
          </Text>
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>
            COST: {fee}¢ FROM YOU
          </Text>
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>
            PARTNER REFUNDED: {itemCost}¢
          </Text>
          {insufficient && (
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 7, color: '#FF3333' }}>
              NEED {fee - spendable}¢ MORE
            </Text>
          )}
          {error && (
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 7, color: '#FF3333' }}>
              {error.toUpperCase()}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
            <Pressable onPress={onClose} disabled={submitting}>
              <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>NEVERMIND</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              disabled={submitting || insufficient}
              style={{ backgroundColor: insufficient ? '#4A4A4A' : '#FFA63F', paddingHorizontal: 10, paddingVertical: 5 }}
            >
              <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#000' }}>
                {submitting ? 'CANCELLING...' : 'CANCEL OBLIGATION'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/game/AmnestyConfirmModal.tsx lib/shop.ts
git commit -m "feat(debt): AmnestyConfirmModal + purchaseAmnesty RPC wrapper"
```

---

## Task 12: WalletHUD chain icon

**Files:**
- Modify: `components/game/WalletHUD.tsx`

- [ ] **Step 1: Read current WalletHUD**

```bash
cat components/game/WalletHUD.tsx
```

Identify the element rendering the coin ticker. The chain glyph should sit immediately to its left.

- [ ] **Step 2: Add `inDebt` prop + conditional chain glyph**

In `components/game/WalletHUD.tsx`:
- Add `inDebt?: boolean` to the component's props.
- Immediately before the coin-count `<Text>` (or wrapping `<View>`), render:

```tsx
{inDebt && (
  <Text style={{ fontFamily: 'PressStart2P', fontSize: 10, color: '#FF3333', marginRight: 4 }}>
    🔗
  </Text>
)}
```

No animation. Pure status.

- [ ] **Step 3: Pass `inDebt` from every caller**

```bash
grep -rn "WalletHUD" app/ components/ --include="*.tsx"
```

For each caller, add `inDebt={debt.inDebt}` using the `useDebtState` hook in the parent. If the parent doesn't yet use the hook, add the hook call (it's idempotent — multiple callers can each invoke it).

- [ ] **Step 4: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/game/WalletHUD.tsx app/
git commit -m "feat(wallet-hud): chain icon when player in debt"
```

---

## Task 13: Log-confirm screen — halved preview

**Files:**
- Modify: the log confirm screen (per session 3 STATE: `components/game/StrikeDrawer.tsx` and `components/game/MoveCard.tsx`)

- [ ] **Step 1: Locate the current coin preview in StrikeDrawer / MoveCard**

```bash
grep -n "coins_earned\|base_value\|expectedCoins\|previewCoins\|coinsEarned" components/game/StrikeDrawer.tsx components/game/MoveCard.tsx
```

Expected: preview math uses `computeLogValues` or a manual duplicate of it. Find where the preview coin number is rendered.

- [ ] **Step 2: Pass debtMultiplier into the preview computation**

At the top of `StrikeDrawer.tsx` (or wherever the preview is computed), pull `debtMultiplier` from `useDebtState(player.id, couple.id).state`. Pass it to `computeLogValues`. Store both the un-debuffed and debuffed value:

```tsx
const debtState = useDebtState(player.id, couple.id).state;
const previewFull = computeLogValues(activity, player, 1.0);
const previewActual = computeLogValues(activity, player, debtState.debtMultiplier);
```

- [ ] **Step 3: Render strikethrough when debuffed**

In `MoveCard.tsx` (or wherever the coin number appears), when `previewFull.coins_earned !== previewActual.coins_earned`:

```tsx
<View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
  <Text style={{ fontFamily: 'PressStart2P', fontSize: 9, color: '#4A4A4A', textDecorationLine: 'line-through' }}>
    {previewFull.coins_earned}
  </Text>
  <Text style={{ fontFamily: 'PressStart2P', fontSize: 12, color: '#FFCC00' }}>
    {previewActual.coins_earned}
  </Text>
</View>
```

Else render the plain number as today.

Round-value preview (from session 3 dual-currency) is **unchanged** — do not strikethrough it.

Below the coin row (only when debuffed), add a small red label:
```tsx
{debtState.inDebt && (
  <Text style={{ fontFamily: 'PressStart2P', fontSize: 6, color: '#FF3333', letterSpacing: 1 }}>
    DEBT · HALF PAY
  </Text>
)}
```

- [ ] **Step 4: Pass debtMultiplier into createLog on submit**

Find the submit handler. Replace:
```ts
await createLog({ activity, player, roundId });
```
with:
```ts
await createLog({ activity, player, roundId, debtMultiplier: debtState.debtMultiplier });
```

- [ ] **Step 5: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/game/StrikeDrawer.tsx components/game/MoveCard.tsx
git commit -m "feat(log): strikethrough coin preview + DEBT·HALF PAY label when debuffed"
```

---

## Task 14: Home wiring — DebtChip + DebtModal on FighterCard

> **DEPENDENCY:** In-flight work on `components/game/DebtBadge.tsx`, `components/game/FighterCard.tsx`, `app/(tabs)/index.tsx` (from `2026-04-20-tribute-debt-loser-anchor-design.md`) must be committed or stashed first. If merged, rebase this task onto it; if stashed, flag that the two will eventually co-exist (the chain sprite and the chip both render for a debuffed loser — that's intentional, not a bug).

**Files:**
- Modify: `components/game/FighterCard.tsx`
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Add `debt` prop to FighterCard**

```bash
grep -n "export function FighterCard\|interface FighterCardProps\|type FighterCardProps" components/game/FighterCard.tsx
```

Add to the props type:
```ts
inDebt?: boolean;
onDebtPress?: () => void;
```

Inside the component, near the name label row, render:
```tsx
{inDebt && <DebtChip onPress={onDebtPress} />}
```

- [ ] **Step 2: Wire from `app/(tabs)/index.tsx`**

At the top of the screen component, add:
```tsx
import { useDebtState } from '../../lib/useDebtState';
import { DebtModal } from '../../components/game/DebtModal';
import { AmnestyConfirmModal } from '../../components/game/AmnestyConfirmModal';
import { getSpendableCoins } from '../../lib/wallet';
import { markTributePaid } from '../../lib/tribute';

const meDebt = useDebtState(player?.id ?? null, couple?.id ?? null);
const partnerDebt = useDebtState(partnerPlayer?.id ?? null, couple?.id ?? null);

const [modalFor, setModalFor] = useState<'me' | 'partner' | null>(null);
const [amnestyFor, setAmnestyFor] = useState<{ purchaseId: string; itemName: string; itemCost: number } | null>(null);
const [spendable, setSpendable] = useState(0);

useEffect(() => {
  if (!player?.id) return;
  getSpendableCoins(player.id).then(setSpendable);
}, [player?.id, meDebt.state]);
```

Pass to FighterCard:
```tsx
<FighterCard
  /* ... existing ... */
  inDebt={meDebt.state.inDebt}
  onDebtPress={() => setModalFor('me')}
/>
<FighterCard
  /* ... existing partner ... */
  inDebt={partnerDebt.state.inDebt}
  onDebtPress={() => setModalFor('partner')}
/>
```

At the bottom of the screen render tree:
```tsx
<DebtModal
  visible={modalFor !== null}
  onClose={() => setModalFor(null)}
  debt={modalFor === 'me' ? meDebt.state : partnerDebt.state}
  viewerIsDebtor={modalFor === 'me'}
  onPay={(src) => {
    if (src.kind === 'tribute') {
      void markTributePaid(src.round_id).then(() => {
        meDebt.refetch();
        setModalFor(null);
      });
    } else {
      // Deep-link into the existing redeem flow for purchases.
      // Wire to the existing "MARK REDEEMED" / deploy flow router in app.
      setModalFor(null);
    }
  }}
  onAmnesty={async (src) => {
    // Load the item cost/name from shop_items for the confirm modal.
    const { data } = await supabase
      .from('shop_items')
      .select('name, cost')
      .eq('id', src.shop_item_id)
      .single();
    if (!data) return;
    setAmnestyFor({ purchaseId: src.purchase_id, itemName: data.name, itemCost: data.cost });
    setModalFor(null);
  }}
/>
<AmnestyConfirmModal
  visible={amnestyFor !== null}
  purchaseId={amnestyFor?.purchaseId ?? null}
  itemName={amnestyFor?.itemName ?? ''}
  itemCost={amnestyFor?.itemCost ?? 0}
  spendable={spendable}
  onClose={() => setAmnestyFor(null)}
  onResolved={() => {
    void meDebt.refetch();
    void getSpendableCoins(player!.id).then(setSpendable);
  }}
/>
```

- [ ] **Step 3: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/index.tsx components/game/FighterCard.tsx
git commit -m "feat(home): wire DebtChip + DebtModal + AmnestyConfirmModal"
```

---

## Task 15: Coin drop animation — debt scaling

**Files:**
- Modify: the CoinDropAnimation component (location TBD)

- [ ] **Step 1: Locate the coin drop animation**

```bash
grep -rn "CoinDrop\|coin_drop\|coinDrop" components/ app/ --include="*.tsx"
```

Expected: find the component. It may live in `components/game/` or be inline in the log submit handler.

- [ ] **Step 2: Accept a `scale` prop (or `debuffed` boolean)**

If the animation takes a `count` or `intensity` param, reduce it by ~50% when debuffed. If the animation is hardcoded, multiply the coin sprite count and the burst radius by 0.5 when `debuffed={true}`.

- [ ] **Step 3: Pass `debuffed={debtState.inDebt}` from the log submit site**

- [ ] **Step 4: Typecheck + smoke (eye test on simulator)**

```bash
cd chore-quest && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/game/
git commit -m "feat(log): halve coin-drop animation intensity when debuffed"
```

---

## Task 16: Shop — "WHAT YOU OWE" section

**Files:**
- Modify: `app/(tabs)/shop.tsx`

- [ ] **Step 1: Load pending purchases where viewer is target**

At the top of the shop screen (after existing state):
```tsx
import { useDebtState } from '../../lib/useDebtState';
import { AmnestyConfirmModal } from '../../components/game/AmnestyConfirmModal';
import { supabase } from '../../lib/supabase';
import { getSpendableCoins } from '../../lib/wallet';

const debt = useDebtState(player?.id ?? null, couple?.id ?? null);
const [itemLookup, setItemLookup] = useState<Record<string, { name: string; cost: number }>>({});
const [amnestyFor, setAmnestyFor] = useState<{ purchaseId: string; itemName: string; itemCost: number } | null>(null);
const [spendable, setSpendable] = useState(0);

useEffect(() => {
  if (!player?.id) return;
  getSpendableCoins(player.id).then(setSpendable);
}, [player?.id, debt.state]);

useEffect(() => {
  const ids = debt.state.sources
    .filter((s): s is Extract<typeof s, { kind: 'purchase' }> => s.kind === 'purchase')
    .map((s) => s.shop_item_id);
  if (ids.length === 0) { setItemLookup({}); return; }
  supabase
    .from('shop_items')
    .select('id, name, cost')
    .in('id', ids)
    .then(({ data }) => {
      const lookup: Record<string, { name: string; cost: number }> = {};
      for (const it of data ?? []) lookup[it.id] = { name: it.name, cost: it.cost };
      setItemLookup(lookup);
    });
}, [debt.state.sources]);
```

- [ ] **Step 2: Render the section above the existing catalog**

At the top of the screen's scroll/list, render (only if there are purchase debts):

```tsx
{debt.state.sources.some((s) => s.kind === 'purchase') && (
  <View style={{ paddingVertical: 12, gap: 8 }}>
    <SectionBanner label="⚖️ WHAT YOU OWE" accent="#FF3333" />
    {debt.state.sources
      .filter((s): s is Extract<typeof s, { kind: 'purchase' }> => s.kind === 'purchase')
      .map((s) => {
        const it = itemLookup[s.shop_item_id];
        if (!it) return null;
        const fee = Math.ceil(it.cost * 1.5);
        const ageLabel = s.age_ms < 3600000 ? 'JUST NOW'
          : s.age_ms < 86400000 ? `${Math.floor(s.age_ms / 3600000)}H`
          : `${Math.floor(s.age_ms / 86400000)}D`;
        return (
          <View key={s.purchase_id} style={{ padding: 8, borderWidth: 2, borderColor: s.age_ms >= 86400000 ? '#FF3333' : '#4A4A4A', gap: 4 }}>
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>{it.name.toUpperCase()}</Text>
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 6, color: '#4A4A4A' }}>{ageLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Pressable
                onPress={() => {
                  // Deep-link to existing redeem flow.
                  // Placeholder: navigate to purchases tab or open the existing redeem modal.
                }}
                style={{ backgroundColor: '#00DDFF', paddingHorizontal: 10, paddingVertical: 4 }}
              >
                <Text style={{ fontFamily: 'PressStart2P', fontSize: 7, color: '#000' }}>PAY</Text>
              </Pressable>
              <Pressable
                onPress={() => setAmnestyFor({ purchaseId: s.purchase_id, itemName: it.name, itemCost: it.cost })}
                style={{ backgroundColor: '#FFA63F', paddingHorizontal: 10, paddingVertical: 4 }}
              >
                <Text style={{ fontFamily: 'PressStart2P', fontSize: 7, color: '#000' }}>AMNESTY · {fee}¢</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
  </View>
)}

<AmnestyConfirmModal
  visible={amnestyFor !== null}
  purchaseId={amnestyFor?.purchaseId ?? null}
  itemName={amnestyFor?.itemName ?? ''}
  itemCost={amnestyFor?.itemCost ?? 0}
  spendable={spendable}
  onClose={() => setAmnestyFor(null)}
  onResolved={() => {
    debt.refetch();
    void getSpendableCoins(player!.id).then(setSpendable);
  }}
/>
```

- [ ] **Step 3: Typecheck**

```bash
cd chore-quest && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/shop.tsx
git commit -m "feat(shop): WHAT YOU OWE section with PAY/AMNESTY per debt"
```

---

## Task 17: Push template for amnesty

**Files:**
- Locate and modify: the variant-picker push templates (session 3 STATE mentions `supabase/functions/_shared/` variant-picker).
- Possibly create: a Postgres trigger that fires a push when `purchases.cancelled_via` flips to `'amnesty'`.

- [ ] **Step 1: Locate existing push-trigger patterns**

```bash
grep -rn "notify_tribute_paid\|notify_tribute_picked\|notify_purchase\|notify_" supabase/functions/ supabase/migrations/
```

Find the closest analog (likely `notify_tribute_paid` from migration 0009).

- [ ] **Step 2: Add a Postgres trigger + notify function for amnesty**

Create migration `0021_notify_amnesty.sql`:

```sql
CREATE OR REPLACE FUNCTION public.notify_amnesty_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cancelled_via = 'amnesty' AND (OLD.cancelled_via IS NULL OR OLD.cancelled_via <> 'amnesty') THEN
    INSERT INTO push_events (kind, payload)
    VALUES ('purchase_amnesty', jsonb_build_object(
      'purchase_id', NEW.id,
      'buyer_id', NEW.buyer_id,
      'target_id', NEW.target_id,
      'shop_item_id', NEW.shop_item_id
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_amnesty_cancelled ON purchases;
CREATE TRIGGER trg_notify_amnesty_cancelled
  AFTER UPDATE ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_amnesty_cancelled();
```

*(Adapt `push_events` table name to whatever the existing push-trigger infrastructure uses — grep the earlier migration to confirm.)*

- [ ] **Step 3: Add a variant-pool entry**

In the variant-picker file (likely `supabase/functions/_shared/variants.ts` or similar), add templates under a new `purchase_amnesty` key:

```ts
purchase_amnesty: [
  '{partner} cancelled "{item}". {refund}¢ refunded.',
  '{partner} paid 1.5× to get out of "{item}". {refund}¢ back in your wallet.',
  'Your "{item}" token was cancelled by {partner}. {refund}¢ returned.',
],
```

- [ ] **Step 4: Wire the push-send edge function to handle `purchase_amnesty`**

Locate `on-log-inserted` / `notifications-tick` / similar. Add a case for `'purchase_amnesty'` that picks a variant, substitutes partner/item/refund, and sends to the buyer's Expo push token.

- [ ] **Step 5: Apply migration + deploy edge functions**

```bash
cd chore-quest && supabase db push
supabase functions deploy on-log-inserted --project-ref <ref>   # or whichever handler fires the push
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0021_notify_amnesty.sql supabase/functions/
git commit -m "feat(push): amnesty-cancelled notification for buyer"
```

---

## Task 18: Deno tests for purchase_amnesty RPC

**Files:**
- Create: `supabase/functions/_shared/amnesty.test.ts` (or a test file at the pattern used by session 3's `tribute-tiers.test.ts`)

- [ ] **Step 1: Inspect the existing Deno test pattern**

```bash
ls supabase/functions/_shared/*.test.ts
cat supabase/functions/_shared/tribute-tiers.test.ts | head -30
```

Note the imports + Supabase-client bootstrap pattern.

- [ ] **Step 2: Write RPC integration tests**

Using the existing Deno test harness, write tests covering:

```ts
// supabase/functions/_shared/amnesty.test.ts
// (exact imports depend on the harness pattern in _shared/)

Deno.test('purchase_amnesty — happy path', async () => {
  // 1. Create couple + 2 players + a shop_item with cost=100
  // 2. As buyer, insert a purchases row (target, status='pending')
  // 3. As target, call rpc('purchase_amnesty', { p_purchase_id })
  // 4. Expect: result.fee = 150, result.refund = 100
  // 5. Expect: purchases.status = 'cancelled', cancelled_via = 'amnesty'
  // 6. Expect: amnesty_fees row with amount=150, payer_id=target
});

Deno.test('purchase_amnesty — rejects non-target caller', async () => {
  // Target sets up purchase; a third party calls RPC → expect 'not_target'
});

Deno.test('purchase_amnesty — rejects already-cancelled purchase', async () => {
  // Pre-cancelled purchase → expect 'purchase_not_open'
});

Deno.test('purchase_amnesty — rejects insufficient funds', async () => {
  // Target has spendable=100, fee=150 → expect 'insufficient_funds'
  // Ensure no amnesty_fees row is written, no status change
});

Deno.test('purchase_amnesty — nonexistent purchase_id', async () => {
  // Expect 'purchase_not_found'
});
```

- [ ] **Step 3: Run**

```bash
cd chore-quest && deno test supabase/functions/_shared/amnesty.test.ts --allow-env --allow-net
```

Expected: 5/5 pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/amnesty.test.ts
git commit -m "test(amnesty): RPC coverage (happy, auth, state, funds, not-found)"
```

---

## Task 19: Manual smoke test

**Files:** none (execute against a running local + device build).

- [ ] **Step 1: Apply all migrations to live DB**

```bash
cd chore-quest && supabase db push
```

- [ ] **Step 2: Deploy edge functions that changed (if Task 17 modified any)**

```bash
supabase functions deploy on-log-inserted --project-ref <ref>
```

- [ ] **Step 3: Build + launch on simulator**

```bash
npx expo start --ios
```

- [ ] **Step 4: Walk the smoke checklist**

1. **No debt baseline.** Both players start with no open debts. No `DebtChip` on either FighterCard. Log an activity — full coins awarded. `wc`/HUD ticks to full value. WalletHUD shows no chain icon.
2. **Create a purchase-token debt.** As Player A, buy a shop item targeting Player B. Immediately switch to Player B — no chip (inside 24h grace). Log an activity as B — full coins.
3. **Simulate the grace timeout.** Using the existing dev tools (`menu.tsx → 🛠 FORCE CLOSE` pattern, or a new dev button if needed), backdate the purchase's `purchased_at` by 25h. Reload Player B's home.
   - Expected: red chip `🔒 IN DEBT · 50% COINS` on Player B's FighterCard. Player A also sees the chip on Player B's card. WalletHUD shows the chain icon.
4. **Log while debuffed.** Open log flow as Player B → pick activity with base=30. Confirm preview shows `30` strikethrough, `15` live. Round-value preview is unchanged. `DEBT · HALF PAY` red label visible. Submit. Coin drop animation plays at reduced intensity. Wallet ticks up by 15, not 30.
5. **Round score unaffected.** If the activity is a chore, confirm the round scoreboard (TodayHaulHUD / leaderboard) increments by full `round_value`, not halved.
6. **XP unaffected.** (Phase 1 UI may not surface XP; verify via SQL query: `SELECT coins_earned, xp_earned FROM logs ORDER BY logged_at DESC LIMIT 1` → coins halved, xp at full base.)
7. **Pay the debt.** Player A (target) is Player B in this flow — flip roles: have Player B redeem the token via existing redemption flow. After mark-redeemed, chip disappears, chain icon gone, next log earns full coins.
8. **Amnesty flow.** Create a second purchase-token debt. Tap chip → `DebtModal` opens. Tap `AMNESTY · {fee}¢`. Confirm modal shows correct fee and refund math. Tap `CANCEL OBLIGATION`.
   - Expected: modal closes, debt is gone, WalletHUD coin total drops by `fee` (amnesty_fees) and buyer's coin total rises by `cost` (cancelled purchase).
   - Verify buyer receives push: `"{partner} cancelled "{item}". {cost}¢ refunded."`
9. **Amnesty insufficient funds.** Contrive a target-spendable < fee scenario (spend the target down). Open Amnesty modal → button disabled, red "NEED X MORE" message.
10. **Unpaid tribute path.** Using `menu.tsx → 🛠 FORCE CLOSE` to close a round with a clear winner, DON'T pay tribute. Wait/backdate >24h. Chip on loser's card. Log as loser → halved.
11. **Tie round (no debt).** Force-close a round where both players tied. No chip on either card.
12. **Inactive round (no debt).** Force-close a round under the 50-point threshold (session 3 dead-round). No chip — `status='inactive'` is excluded from the debt query.
13. **Partner view of other's debt.** Partner taps the chip on the debtor's FighterCard → `DebtModal` opens in read-only (no action buttons).
14. **Shop "WHAT YOU OWE" section.** On Player B (debuffed), open shop — section at top shows the two debts with PAY/AMNESTY buttons. Cancel one via amnesty — section updates in place.
15. **Regression: existing tribute flow.** The existing `MARK PAID` / ball-and-chain rendering from `2026-04-20-tribute-debt-loser-anchor-design.md` still works identically.

- [ ] **Step 5: Record results in STATE.md**

Update `STATE.md` with a Session N entry covering: migrations applied, edge functions deployed, smoke checklist results (pass/fail per numbered item), any follow-ups discovered.

- [ ] **Step 6: Commit**

```bash
git add STATE.md
git commit -m "docs(state): debt-debuff session smoke-test results"
```

---

## Self-Review Notes

Covered against spec:
- §1 Mechanic (trigger + 0.5 coins only) → Tasks 4, 6
- §2 Data / helper → Tasks 1, 2, 3 (migration surfaces), 4 (lib/debt.ts)
- §3.1 Home chip → Task 9 (component) + Task 14 (wire)
- §3.2 Log confirm strikethrough → Task 13
- §3.3 Coin drop scaling → Task 15
- §3.4 WalletHUD chain icon → Task 12
- §3.5 Shop "WHAT YOU OWE" → Task 16
- §4 Amnesty flow → Tasks 1, 2 (RPC), 11 (modal), 17 (push)
- §5 Edge cases → implicit in Tasks 4/8 + Task 19 smoke items 11, 12, 13
- §6 Out-of-scope items — confirmed not scheduled (flat, coins-only, no crits-off, no tribute-amnesty)
- §7 Testing → Tasks 5, 7, 18, 19

Gaps accepted:
- Server-side debt check at log-insert time (mentioned in spec §5 "server is source of truth"). Current implementation trusts client-side (matches existing pattern for `player_multiplier`, `combo_multiplier`). Follow-up: add a Postgres trigger on `logs` insert that validates `coins_earned` against a server-computed debt multiplier; out of scope for v1 to keep the pattern consistent.
- `getSpendableCoins` is called on every screen that needs the wallet; we don't cache it. Adding a subscription via Supabase Realtime on `amnesty_fees` + `purchases` would be a polish follow-up; for v1 the 5-minute `useDebtState` interval + explicit `refetch()` on modal dismissal covers the common paths.
