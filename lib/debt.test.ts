// lib/debt.test.ts — Deno unit tests for computeDebtState.
// Run with: deno test --no-check --allow-read lib/debt.test.ts
//
// We import from './debt.ts' (explicit extension) so Deno resolves without
// needing a tsconfig. Fixtures are cast to `any` to avoid re-declaring the
// full Purchase/Round type surface — computeDebtState only reads the fields
// referenced below.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeDebtState } from './debt.ts';

const playerId = 'p1';
const coupleId = 'c1';
const otherPlayer = 'p2';

const now = new Date('2026-04-20T12:00:00Z');
const h25ago = new Date('2026-04-19T11:00:00Z').toISOString();
const h10ago = new Date('2026-04-20T02:00:00Z').toISOString();

// 1. No debts → inDebt=false, multiplier 1.0
Deno.test('no debts → inDebt=false, multiplier 1.0', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [],
    rounds: [],
    now,
  });
  assertEquals(s.inDebt, false);
  assertEquals(s.debtMultiplier, 1.0);
  assertEquals(s.sources.length, 0);
  assertEquals(s.activeSources.length, 0);
});

// 2. Purchase debt <24h → inDebt=false (grace), sources has 1, activeSources empty
Deno.test('purchase debt <24h → grace, not in debt but tracked', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [
      {
        id: 'pu1',
        target_id: playerId,
        buyer_id: otherPlayer,
        shop_item_id: 's1',
        status: 'pending',
        purchased_at: h10ago,
      } as any,
    ],
    rounds: [],
    now,
  });
  assertEquals(s.inDebt, false);
  assertEquals(s.debtMultiplier, 1.0);
  assertEquals(s.sources.length, 1);
  assertEquals(s.activeSources.length, 0);
});

// 3. Purchase debt >24h → inDebt=true, multiplier 0.5
Deno.test('purchase debt >24h → inDebt=true, multiplier 0.5', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [
      {
        id: 'pu1',
        target_id: playerId,
        buyer_id: otherPlayer,
        shop_item_id: 's1',
        status: 'pending',
        purchased_at: h25ago,
      } as any,
    ],
    rounds: [],
    now,
  });
  assertEquals(s.inDebt, true);
  assertEquals(s.debtMultiplier, 0.5);
  assertEquals(s.sources.length, 1);
  assertEquals(s.activeSources.length, 1);
});

// 4. Purchase debt targeting someone else → inDebt=false
Deno.test('purchase targeting someone else → ignored', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [
      {
        id: 'pu1',
        target_id: otherPlayer,
        buyer_id: playerId,
        shop_item_id: 's1',
        status: 'pending',
        purchased_at: h25ago,
      } as any,
    ],
    rounds: [],
    now,
  });
  assertEquals(s.inDebt, false);
  assertEquals(s.sources.length, 0);
});

// 5. Cancelled and redeemed purchases → ignored, inDebt=false
Deno.test('cancelled and redeemed purchases → ignored', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [
      {
        id: 'pu1',
        target_id: playerId,
        buyer_id: otherPlayer,
        shop_item_id: 's1',
        status: 'cancelled',
        purchased_at: h25ago,
      } as any,
      {
        id: 'pu2',
        target_id: playerId,
        buyer_id: otherPlayer,
        shop_item_id: 's2',
        status: 'redeemed',
        purchased_at: h25ago,
      } as any,
    ],
    rounds: [],
    now,
  });
  assertEquals(s.inDebt, false);
  assertEquals(s.sources.length, 0);
});

// 6. redemption_requested status → treated as still-owed
Deno.test('redemption_requested → treated as still-owed', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [
      {
        id: 'pu1',
        target_id: playerId,
        buyer_id: otherPlayer,
        shop_item_id: 's1',
        status: 'redemption_requested',
        purchased_at: h25ago,
      } as any,
    ],
    rounds: [],
    now,
  });
  assertEquals(s.inDebt, true);
  assertEquals(s.debtMultiplier, 0.5);
  assertEquals(s.sources.length, 1);
  assertEquals(s.activeSources.length, 1);
});

// 7. Tribute (closed round, winner ≠ me, >24h past end_date) → inDebt=true
Deno.test('tribute: closed round, winner≠me, >24h → inDebt=true', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [],
    rounds: [
      {
        id: 'r1',
        couple_id: coupleId,
        status: 'closed',
        winner_id: otherPlayer,
        tribute_paid: false,
        tribute_shop_item_id: 'ts1',
        // end_date 2026-04-18 → end-of-day UTC is 2026-04-18T23:59:59Z,
        // which is ~36h before `now` (2026-04-20T12:00:00Z).
        end_date: '2026-04-18',
      } as any,
    ],
    now,
  });
  assertEquals(s.inDebt, true);
  assertEquals(s.debtMultiplier, 0.5);
  assertEquals(s.sources.length, 1);
  assertEquals(s.activeSources.length, 1);
  assertEquals(s.sources[0].kind, 'tribute');
});

// 8. Tribute on an 'inactive' round → inDebt=false (dead-round threshold)
Deno.test("tribute on an 'inactive' round → ignored", () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [],
    rounds: [
      {
        id: 'r1',
        couple_id: coupleId,
        status: 'inactive',
        winner_id: otherPlayer,
        tribute_paid: false,
        tribute_shop_item_id: 'ts1',
        end_date: '2026-04-18',
      } as any,
    ],
    now,
  });
  assertEquals(s.inDebt, false);
  assertEquals(s.sources.length, 0);
});

// 9. Tied round (winner_id=null) → inDebt=false
Deno.test('tied round (winner_id=null) → no tribute', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [],
    rounds: [
      {
        id: 'r1',
        couple_id: coupleId,
        status: 'closed',
        winner_id: null,
        tribute_paid: false,
        tribute_shop_item_id: null,
        end_date: '2026-04-18',
      } as any,
    ],
    now,
  });
  assertEquals(s.inDebt, false);
  assertEquals(s.sources.length, 0);
});

// 10. Round where I won → inDebt=false
Deno.test('round where I won → no tribute', () => {
  const s = computeDebtState({
    playerId,
    coupleId,
    purchases: [],
    rounds: [
      {
        id: 'r1',
        couple_id: coupleId,
        status: 'closed',
        winner_id: playerId,
        tribute_paid: false,
        tribute_shop_item_id: 'ts1',
        end_date: '2026-04-18',
      } as any,
    ],
    now,
  });
  assertEquals(s.inDebt, false);
  assertEquals(s.sources.length, 0);
});
