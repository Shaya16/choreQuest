// Pure-logic mirror of the purchase_amnesty RPC defined in
// supabase/migrations/0020_debt_amnesty.sql.
//
// This module is NOT used in production — production always goes through
// the SQL RPC so that row locks, RLS, and atomicity are honored. This file
// exists so Deno tests can exercise the RPC's decision tree (fee formula,
// spendable calc, status transitions, error classification) without a live
// Postgres instance.
//
// Keep this file in lockstep with migration 0020. If the SQL changes, this
// changes too — otherwise the tests become decorative.

export type PurchaseStatus =
  | 'pending'
  | 'redemption_requested'
  | 'redeemed'
  | 'cancelled';

export type CancelledVia = 'amnesty' | 'buyer_cancel' | null;

export type Purchase = {
  id: string;
  buyer_id: string;
  target_id: string;
  shop_item_id: string;
  status: PurchaseStatus;
  cancelled_via: CancelledVia;
};

export type ShopItem = {
  id: string;
  cost: number;
};

export type Log = {
  player_id: string;
  personal_share: number;
  jackpot_share: number;
};

export type Round = {
  winner_id: string | null;
  winner_bonus_coins: number;
};

export type AmnestyFee = {
  payer_id: string;
  amount: number;
};

export type AmnestyError =
  | 'purchase_not_found'
  | 'not_target'
  | 'purchase_not_open'
  | 'shop_item_not_found'
  | 'insufficient_funds'
  | 'no_player_for_auth_user';

export type AmnestyState = {
  callerPlayerId: string | null;
  purchases: Purchase[];
  shopItems: ShopItem[];
  logs: Log[];
  rounds: Round[];
  amnestyFees: AmnestyFee[];
};

export type AmnestyResult = {
  fee: number;
  refund: number;
  target_spendable: number;
  buyer_id: string;
};

/**
 * Mirrors `ceil(v_item.cost * 1.5)::INT` in the RPC.
 * The target pays 150% of the purchase cost to veto it.
 */
export function amnestyFee(cost: number): number {
  return Math.ceil(cost * 1.5);
}

/**
 * Mirrors the inline spendable calc in the RPC (which itself mirrors
 * lib/wallet.ts::getSpendableCoins, extended with the amnesty_fees deduction).
 */
export function computeSpendable(playerId: string, state: AmnestyState): number {
  const earned = state.logs
    .filter((l) => l.player_id === playerId)
    .reduce((a, l) => a + (l.personal_share ?? 0) + (l.jackpot_share ?? 0), 0);

  const bonus = state.rounds
    .filter((r) => r.winner_id === playerId)
    .reduce((a, r) => a + (r.winner_bonus_coins ?? 0), 0);

  const costById = new Map(state.shopItems.map((i) => [i.id, i.cost]));
  const spent = state.purchases
    .filter((p) => p.buyer_id === playerId && p.status !== 'cancelled')
    .reduce((a, p) => a + (costById.get(p.shop_item_id) ?? 0), 0);

  const amnestyPaid = state.amnestyFees
    .filter((f) => f.payer_id === playerId)
    .reduce((a, f) => a + f.amount, 0);

  return earned + bonus - spent - amnestyPaid;
}

/**
 * Mirrors the decision tree and state transitions of purchase_amnesty.
 * Returns a new state + result on success, or the RPC's error string on failure.
 * The input state is NOT mutated.
 */
export function purchaseAmnesty(
  p_purchase_id: string,
  state: AmnestyState
): { ok: true; state: AmnestyState; result: AmnestyResult } | { ok: false; error: AmnestyError } {
  if (state.callerPlayerId === null) {
    return { ok: false, error: 'no_player_for_auth_user' };
  }

  const purchase = state.purchases.find((p) => p.id === p_purchase_id);
  if (!purchase) return { ok: false, error: 'purchase_not_found' };

  if (purchase.target_id !== state.callerPlayerId) {
    return { ok: false, error: 'not_target' };
  }

  if (purchase.status !== 'pending' && purchase.status !== 'redemption_requested') {
    return { ok: false, error: 'purchase_not_open' };
  }

  const item = state.shopItems.find((i) => i.id === purchase.shop_item_id);
  if (!item) return { ok: false, error: 'shop_item_not_found' };

  const fee = amnestyFee(item.cost);
  const spendable = computeSpendable(state.callerPlayerId, state);
  if (spendable < fee) return { ok: false, error: 'insufficient_funds' };

  const nextState: AmnestyState = {
    ...state,
    purchases: state.purchases.map((p) =>
      p.id === p_purchase_id
        ? { ...p, status: 'cancelled' as const, cancelled_via: 'amnesty' as const }
        : p
    ),
    amnestyFees: [
      ...state.amnestyFees,
      { payer_id: state.callerPlayerId, amount: fee },
    ],
  };

  return {
    ok: true,
    state: nextState,
    result: {
      fee,
      refund: item.cost,
      target_spendable: spendable - fee,
      buyer_id: purchase.buyer_id,
    },
  };
}
