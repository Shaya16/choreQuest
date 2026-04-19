import { renderVariant } from './variants.ts';

export type VariantPickResult = {
  text: string;
  index: number;
};

/**
 * Picks a variant from the pool excluding lastIndex and renders it with vars.
 * Falls through to full pool when lastIndex is null or out of bounds.
 * When only one variant exists, returns it even if it matches lastIndex —
 * rotation guarantee is best-effort, never blocks delivery.
 */
export function pickVariant(
  variants: string[],
  lastIndex: number | null,
  vars: Record<string, string | number>,
  rand: () => number = Math.random
): VariantPickResult {
  if (variants.length === 0) {
    throw new Error('pickVariant: empty variant pool');
  }
  if (variants.length === 1) {
    return { text: renderVariant(variants[0], vars), index: 0 };
  }
  const candidates =
    lastIndex === null || lastIndex < 0 || lastIndex >= variants.length
      ? variants.map((_, i) => i)
      : variants.map((_, i) => i).filter((i) => i !== lastIndex);
  const index = candidates[Math.floor(rand() * candidates.length)];
  return { text: renderVariant(variants[index], vars), index };
}
