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
