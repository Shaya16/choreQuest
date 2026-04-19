import type { ShopCategory } from './types';

export type CostTier = 'standard' | 'mid' | 'premium';

/**
 * Classifies a shop item by cost into one of three visual tiers. Drives
 * border weight and corner-star treatment on PurchaseCard.
 */
export function tierForCost(cost: number): CostTier {
  if (cost <= 300) return 'standard';
  if (cost <= 600) return 'mid';
  return 'premium';
}

/**
 * Maps a ShopCategory to its accent color from the locked palette. Used by
 * PurchaseCard borders, price-tag footers, and category section banners.
 */
export function accentForCategory(category: ShopCategory): string {
  switch (category) {
    case 'pampering':
      return '#FFB8DE'; // ghost-pink
    case 'meals':
      return '#FFCC00'; // pac-yellow
    case 'chore_relief':
      return '#00DDFF'; // ghost-cyan
    case 'power':
      return '#FF3333'; // ghost-red
    case 'wildcard':
      return '#9EFA00'; // power-lime
  }
}

/**
 * Formats a coin integer for display in the WalletHUD register and
 * PurchaseCard price footer. Comma-separates thousands and prefixes the
 * cent symbol. e.g. 1247 -> "¢ 1,247".
 */
export function formatCoins(n: number): string {
  return `¢ ${n.toLocaleString()}`;
}
