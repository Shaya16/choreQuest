import { supabase } from './supabase';
import type { Purchase, ShopCategory, ShopItem } from './types';

/**
 * A purchase joined with its shop item. The Shop screen's rendering wants
 * both sides of the join present on each row so it can show the item name/
 * cost without re-querying per row.
 */
export type PurchaseWithItem = Purchase & { shop_item: ShopItem | null };

/**
 * Loads the signed-in player's ARSENAL — purchases they bought (any status
 * in 'pending' / 'redemption_requested') that haven't been delivered yet.
 * Ordered oldest-first so stack consumption is FIFO.
 */
export async function loadArsenal(
  buyerId: string
): Promise<PurchaseWithItem[]> {
  const { data } = await supabase
    .from('purchases')
    .select('*, shop_item:shop_items(*)')
    .eq('buyer_id', buyerId)
    .in('status', ['pending', 'redemption_requested'])
    .order('purchased_at', { ascending: true });
  return (data ?? []) as unknown as PurchaseWithItem[];
}

/**
 * Loads the signed-in player's QUEUE — purchases where someone else bought
 * something FROM them and it isn't delivered yet. Same status filter as
 * arsenal; sorted with redemption_requested first (most urgent), then pending.
 */
export async function loadQueue(
  targetId: string
): Promise<PurchaseWithItem[]> {
  const { data } = await supabase
    .from('purchases')
    .select('*, shop_item:shop_items(*)')
    .eq('target_id', targetId)
    .in('status', ['pending', 'redemption_requested'])
    .order('status', { ascending: true })
    .order('purchased_at', { ascending: true });
  const rows = (data ?? []) as unknown as PurchaseWithItem[];
  // Manual re-sort: 'redemption_requested' before 'pending', then by date.
  const order: Record<string, number> = {
    redemption_requested: 0,
    pending: 1,
  };
  return rows.slice().sort((a, b) => {
    const oa = order[a.status] ?? 9;
    const ob = order[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.purchased_at.localeCompare(b.purchased_at);
  });
}

/**
 * Loads the full active catalog grouped by category. Activities are cached
 * in the session store but shop items aren't — the shop catalog is small
 * enough that querying on focus is fine.
 */
export async function loadCatalogGrouped(): Promise<
  Record<ShopCategory, ShopItem[]>
> {
  const { data } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_active', true)
    .order('cost', { ascending: true });
  const groups: Record<ShopCategory, ShopItem[]> = {
    pampering: [],
    meals: [],
    chore_relief: [],
    power: [],
    wildcard: [],
  };
  for (const row of (data ?? []) as ShopItem[]) {
    if (groups[row.category]) groups[row.category].push(row);
  }
  return groups;
}

/**
 * Buys one of the given shop item. Inserts a purchases row with status
 * 'pending'. Coins are NOT deducted here — getSpendableCoins already
 * subtracts live on read from non-cancelled purchase rows.
 */
export async function buyItem(
  shopItemId: string,
  buyerId: string,
  targetId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('purchases').insert({
    shop_item_id: shopItemId,
    buyer_id: buyerId,
    target_id: targetId,
    status: 'pending',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Flips ONE row in the buyer's stack of this shop_item from 'pending' to
 * 'redemption_requested'. Consumes FIFO (oldest pending row first).
 */
export async function requestRedemption(
  buyerId: string,
  shopItemId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: rows, error: qErr } = await supabase
    .from('purchases')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('shop_item_id', shopItemId)
    .eq('status', 'pending')
    .order('purchased_at', { ascending: true })
    .limit(1);
  if (qErr) return { ok: false, error: qErr.message };
  const rowId = rows?.[0]?.id;
  if (!rowId) return { ok: false, error: 'no pending token in stack' };

  const { error: uErr } = await supabase
    .from('purchases')
    .update({
      status: 'redemption_requested',
      redemption_requested_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .eq('status', 'pending');
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true };
}

/**
 * Flips a specific redemption-requested purchase to 'redeemed'. Only called
 * from the target's QUEUE view.
 */
export async function confirmDelivery(
  purchaseId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('purchases')
    .update({
      status: 'redeemed',
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', purchaseId)
    .eq('status', 'redemption_requested');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Groups an arsenal list by shop_item_id so the Shop screen can render a
 * single "×N" row per pending stack. Awaiting-delivery rows are NOT grouped
 * — each gets its own row so the user can see how many are outstanding.
 */
export function groupArsenal(
  purchases: PurchaseWithItem[]
): {
  pendingStacks: { item: ShopItem; count: number }[];
  awaiting: PurchaseWithItem[];
} {
  const stacks = new Map<string, { item: ShopItem; count: number }>();
  const awaiting: PurchaseWithItem[] = [];
  for (const p of purchases) {
    if (!p.shop_item) continue;
    if (p.status === 'redemption_requested') {
      awaiting.push(p);
      continue;
    }
    const existing = stacks.get(p.shop_item_id);
    if (existing) existing.count++;
    else stacks.set(p.shop_item_id, { item: p.shop_item, count: 1 });
  }
  return {
    pendingStacks: Array.from(stacks.values()),
    awaiting,
  };
}

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
