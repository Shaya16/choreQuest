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

  // Sort by age descending — oldest debt (largest age_ms) rises to the TOP of
  // the list so callers displaying "pay the oldest first" get the right order.
  // The sources with the largest age_ms are the most overdue.
  sources.sort((a, b) => b.age_ms - a.age_ms);

  const activeSources = sources.filter((s) => s.age_ms >= GRACE_MS);
  const inDebt = activeSources.length > 0;

  return {
    inDebt,
    debtMultiplier: inDebt ? 0.5 : 1.0,
    sources,
    activeSources,
  };
}
