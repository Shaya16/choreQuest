import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  tierForMargin,
  tierForFlawlessOverride,
  costRangeForTier,
  selectFourTributeCards,
  type TributeTier,
} from './tribute-tiers.ts';

Deno.test('tierForMargin: paper_cut for 1..39', () => {
  assertEquals(tierForMargin(1), 'paper_cut');
  assertEquals(tierForMargin(39), 'paper_cut');
});

Deno.test('tierForMargin: knockout for 40..149', () => {
  assertEquals(tierForMargin(40), 'knockout');
  assertEquals(tierForMargin(149), 'knockout');
});

Deno.test('tierForMargin: total_carnage for 150+', () => {
  assertEquals(tierForMargin(150), 'total_carnage');
  assertEquals(tierForMargin(9999), 'total_carnage');
});

Deno.test('tierForMargin: null for 0', () => {
  assertEquals(tierForMargin(0), null);
});

Deno.test('tierForFlawlessOverride: loser logged 0 → flawless', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 0, winnerWorldCount: 0, totalContestedWorlds: 0 }),
    'flawless'
  );
});

Deno.test('tierForFlawlessOverride: winner ≥5 of 6 worlds → flawless', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 3, winnerWorldCount: 5, totalContestedWorlds: 6 }),
    'flawless'
  );
});

Deno.test('tierForFlawlessOverride: only 2 worlds contested → no flawless even if winner takes both', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 1, winnerWorldCount: 2, totalContestedWorlds: 2 }),
    null
  );
});

Deno.test('tierForFlawlessOverride: 4-of-6 worlds → no flawless', () => {
  assertEquals(
    tierForFlawlessOverride({ loserLogCount: 5, winnerWorldCount: 4, totalContestedWorlds: 6 }),
    null
  );
});

Deno.test('costRangeForTier: ranges per spec', () => {
  assertEquals(costRangeForTier('paper_cut'), { min: 80, max: 249 });
  assertEquals(costRangeForTier('knockout'), { min: 250, max: 449 });
  assertEquals(costRangeForTier('total_carnage'), { min: 450, max: 699 });
  assertEquals(costRangeForTier('flawless'), { min: 700, max: 99999 });
});

Deno.test('selectFourTributeCards: deterministic per round id', () => {
  const items = [
    { id: 'a', cost: 300 },
    { id: 'b', cost: 250 },
    { id: 'c', cost: 400 },
    { id: 'd', cost: 350 },
    { id: 'e', cost: 280 },
    { id: 'f', cost: 320 },
  ];
  const a = selectFourTributeCards(items, 'knockout', 'round-id-1');
  const b = selectFourTributeCards(items, 'knockout', 'round-id-1');
  assertEquals(a, b);
  assertEquals(a.length, 4);
  assertEquals(
    a.every((it) => it.cost >= 250 && it.cost <= 449),
    true
  );
});

Deno.test('selectFourTributeCards: fewer than 4 in tier → fills from adjacent down', () => {
  const items = [
    { id: 'a', cost: 800 }, // flawless
    { id: 'b', cost: 600 }, // total_carnage
    { id: 'c', cost: 550 }, // total_carnage
    { id: 'd', cost: 300 }, // knockout
    { id: 'e', cost: 280 }, // knockout
    { id: 'f', cost: 200 }, // paper_cut
  ];
  const result = selectFourTributeCards(items, 'flawless', 'round-id-1');
  assertEquals(result.length, 4);
  // Should pull at least the one flawless item
  assertEquals(result.some((it) => it.cost >= 700), true);
});
