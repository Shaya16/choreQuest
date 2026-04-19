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
