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
  _playerId: string
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
  // Backdate end_date so the round looks "due"...
  const { error: rpcError } = await supabase.rpc('dev_force_close_round');
  if (rpcError) return { ok: false, error: rpcError.message };
  // ...then immediately invoke the edge function so the close + push happens
  // now instead of waiting up to 10 min for the next pg_cron tick.
  const { error: fnError } = await supabase.functions.invoke('round-rollover-tick', {
    body: {},
  });
  if (fnError) return { ok: false, error: `invoke failed: ${fnError.message}` };
  return { ok: true };
}
