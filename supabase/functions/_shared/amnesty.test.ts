import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  amnestyFee,
  computeSpendable,
  purchaseAmnesty,
  type AmnestyState,
  type Purchase,
  type ShopItem,
} from './amnesty.ts';

// --- Fee formula (ceil(cost * 1.5)) ---------------------------------------

Deno.test('amnestyFee: 10 → 15', () => {
  assertEquals(amnestyFee(10), 15);
});

Deno.test('amnestyFee: 1 → 2 (ceil of 1.5)', () => {
  assertEquals(amnestyFee(1), 2);
});

Deno.test('amnestyFee: 3 → 5 (ceil of 4.5)', () => {
  assertEquals(amnestyFee(3), 5);
});

Deno.test('amnestyFee: 0 → 0', () => {
  assertEquals(amnestyFee(0), 0);
});

Deno.test('amnestyFee: 100 → 150', () => {
  assertEquals(amnestyFee(100), 150);
});

// --- Fixture builder ------------------------------------------------------

const TARGET = 'target-player';
const BUYER = 'buyer-player';
const PURCHASE_ID = 'pur-1';
const ITEM_ID = 'item-1';

function baseState(overrides: Partial<AmnestyState> = {}): AmnestyState {
  const item: ShopItem = { id: ITEM_ID, cost: 20 };
  const purchase: Purchase = {
    id: PURCHASE_ID,
    buyer_id: BUYER,
    target_id: TARGET,
    shop_item_id: ITEM_ID,
    status: 'pending',
    cancelled_via: null,
  };
  return {
    callerPlayerId: TARGET,
    purchases: [purchase],
    shopItems: [item],
    // 200 coins earned — plenty for the 30-coin fee.
    logs: [{ player_id: TARGET, personal_share: 140, jackpot_share: 60 }],
    rounds: [],
    amnestyFees: [],
    ...overrides,
  };
}

// --- computeSpendable parity ---------------------------------------------

Deno.test('computeSpendable: logs + bonuses − non-cancelled purchases − amnesty fees', () => {
  const state: AmnestyState = {
    callerPlayerId: TARGET,
    purchases: [
      // Target bought something for 10; non-cancelled → subtract.
      {
        id: 'pur-x',
        buyer_id: TARGET,
        target_id: BUYER,
        shop_item_id: 'item-cheap',
        status: 'pending',
        cancelled_via: null,
      },
      // Target bought something that was later cancelled → ignore.
      {
        id: 'pur-y',
        buyer_id: TARGET,
        target_id: BUYER,
        shop_item_id: 'item-exp',
        status: 'cancelled',
        cancelled_via: 'amnesty',
      },
    ],
    shopItems: [
      { id: 'item-cheap', cost: 10 },
      { id: 'item-exp', cost: 999 },
    ],
    logs: [{ player_id: TARGET, personal_share: 100, jackpot_share: 25 }],
    rounds: [{ winner_id: TARGET, winner_bonus_coins: 7 }],
    amnestyFees: [{ payer_id: TARGET, amount: 3 }],
  };
  // 100 + 25 + 7 − 10 − 3 = 119
  assertEquals(computeSpendable(TARGET, state), 119);
});

Deno.test("computeSpendable: other player's rows are ignored", () => {
  const state: AmnestyState = {
    callerPlayerId: TARGET,
    purchases: [],
    shopItems: [],
    logs: [{ player_id: 'someone-else', personal_share: 500, jackpot_share: 500 }],
    rounds: [{ winner_id: 'someone-else', winner_bonus_coins: 99 }],
    amnestyFees: [{ payer_id: 'someone-else', amount: 50 }],
  };
  assertEquals(computeSpendable(TARGET, state), 0);
});

// --- Happy path -----------------------------------------------------------

Deno.test('purchaseAmnesty: happy path cancels + records fee + returns refund', () => {
  const state = baseState();
  const res = purchaseAmnesty(PURCHASE_ID, state);
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);

  // Fee is ceil(20 * 1.5) = 30
  assertEquals(res.result.fee, 30);
  assertEquals(res.result.refund, 20);
  // Spendable was 200, − 30 fee.
  assertEquals(res.result.target_spendable, 170);
  assertEquals(res.result.buyer_id, BUYER);

  // State transitions
  const updated = res.state.purchases.find((p) => p.id === PURCHASE_ID)!;
  assertEquals(updated.status, 'cancelled');
  assertEquals(updated.cancelled_via, 'amnesty');
  assertEquals(res.state.amnestyFees.length, 1);
  assertEquals(res.state.amnestyFees[0].payer_id, TARGET);
  assertEquals(res.state.amnestyFees[0].amount, 30);

  // Original state untouched (immutability).
  assertEquals(state.purchases[0].status, 'pending');
  assertEquals(state.amnestyFees.length, 0);
});

Deno.test('purchaseAmnesty: also allowed on redemption_requested', () => {
  const state = baseState({
    purchases: [
      {
        id: PURCHASE_ID,
        buyer_id: BUYER,
        target_id: TARGET,
        shop_item_id: ITEM_ID,
        status: 'redemption_requested',
        cancelled_via: null,
      },
    ],
  });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, true);
});

// --- Error paths ----------------------------------------------------------

Deno.test('purchaseAmnesty: rejects non-target caller (not_target)', () => {
  const state = baseState({ callerPlayerId: BUYER });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'not_target');
});

Deno.test('purchaseAmnesty: rejects third-party caller (not_target)', () => {
  const state = baseState({ callerPlayerId: 'random-player' });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'not_target');
});

Deno.test('purchaseAmnesty: rejects already-cancelled purchase (purchase_not_open)', () => {
  const state = baseState({
    purchases: [
      {
        id: PURCHASE_ID,
        buyer_id: BUYER,
        target_id: TARGET,
        shop_item_id: ITEM_ID,
        status: 'cancelled',
        cancelled_via: 'buyer_cancel',
      },
    ],
  });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'purchase_not_open');
});

Deno.test('purchaseAmnesty: rejects redeemed purchase (purchase_not_open)', () => {
  const state = baseState({
    purchases: [
      {
        id: PURCHASE_ID,
        buyer_id: BUYER,
        target_id: TARGET,
        shop_item_id: ITEM_ID,
        status: 'redeemed',
        cancelled_via: null,
      },
    ],
  });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'purchase_not_open');
});

Deno.test('purchaseAmnesty: rejects insufficient funds without mutating state', () => {
  const state = baseState({
    // Fee is 30, but only 10 available.
    logs: [{ player_id: TARGET, personal_share: 10, jackpot_share: 0 }],
  });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'insufficient_funds');

  // No state change — purchase stays pending, no fee row appended.
  assertEquals(state.purchases[0].status, 'pending');
  assertEquals(state.amnestyFees.length, 0);
});

Deno.test('purchaseAmnesty: rejects when spendable exactly 1 below fee', () => {
  const state = baseState({
    // Fee 30, spendable 29.
    logs: [{ player_id: TARGET, personal_share: 29, jackpot_share: 0 }],
  });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'insufficient_funds');
});

Deno.test('purchaseAmnesty: allows when spendable exactly equals fee', () => {
  const state = baseState({
    logs: [{ player_id: TARGET, personal_share: 30, jackpot_share: 0 }],
  });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, true);
  if (!res.ok) return;
  assertEquals(res.result.target_spendable, 0);
});

Deno.test('purchaseAmnesty: rejects nonexistent purchase (purchase_not_found)', () => {
  const state = baseState();
  const res = purchaseAmnesty('does-not-exist', state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'purchase_not_found');
});

Deno.test('purchaseAmnesty: rejects when caller has no player row (no_player_for_auth_user)', () => {
  const state = baseState({ callerPlayerId: null });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'no_player_for_auth_user');
});

Deno.test('purchaseAmnesty: rejects when shop item missing (shop_item_not_found)', () => {
  const state = baseState({ shopItems: [] });
  const res = purchaseAmnesty(PURCHASE_ID, state);
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error, 'shop_item_not_found');
});

// --- Cumulative fees correctly reduce spendable for the next call ---------

Deno.test('purchaseAmnesty: second amnesty sees the first fee deducted', () => {
  const item2: ShopItem = { id: 'item-2', cost: 40 };
  const purchase2: Purchase = {
    id: 'pur-2',
    buyer_id: BUYER,
    target_id: TARGET,
    shop_item_id: 'item-2',
    status: 'pending',
    cancelled_via: null,
  };
  const state: AmnestyState = baseState({
    // Bump funds so both can pass (need 30 + 60 = 90).
    logs: [{ player_id: TARGET, personal_share: 95, jackpot_share: 0 }],
    shopItems: [{ id: ITEM_ID, cost: 20 }, item2],
    purchases: [
      {
        id: PURCHASE_ID,
        buyer_id: BUYER,
        target_id: TARGET,
        shop_item_id: ITEM_ID,
        status: 'pending',
        cancelled_via: null,
      },
      purchase2,
    ],
  });

  const first = purchaseAmnesty(PURCHASE_ID, state);
  if (!first.ok) throw new Error('first call should succeed');
  assertEquals(first.result.fee, 30);
  assertEquals(first.result.target_spendable, 65);

  const second = purchaseAmnesty('pur-2', first.state);
  if (!second.ok) throw new Error('second call should succeed');
  assertEquals(second.result.fee, 60);
  // 95 − 60 (fee2) − 30 (amnesty1 already paid) = 5
  assertEquals(second.result.target_spendable, 5);
});

Deno.test('purchaseAmnesty: second amnesty fails if first exhausted funds', () => {
  const item2: ShopItem = { id: 'item-2', cost: 40 };
  const state: AmnestyState = baseState({
    // Only enough for the first fee (30), not second (60).
    logs: [{ player_id: TARGET, personal_share: 30, jackpot_share: 0 }],
    shopItems: [{ id: ITEM_ID, cost: 20 }, item2],
    purchases: [
      {
        id: PURCHASE_ID,
        buyer_id: BUYER,
        target_id: TARGET,
        shop_item_id: ITEM_ID,
        status: 'pending',
        cancelled_via: null,
      },
      {
        id: 'pur-2',
        buyer_id: BUYER,
        target_id: TARGET,
        shop_item_id: 'item-2',
        status: 'pending',
        cancelled_via: null,
      },
    ],
  });

  const first = purchaseAmnesty(PURCHASE_ID, state);
  if (!first.ok) throw new Error('first call should succeed');

  const second = purchaseAmnesty('pur-2', first.state);
  assertEquals(second.ok, false);
  if (second.ok) return;
  assertEquals(second.error, 'insufficient_funds');
});
