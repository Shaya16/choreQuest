import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCloseResult, type LogForClose } from './round-close.ts';

const mkLog = (player_id: string, coins: number, world: string): LogForClose => ({
  player_id,
  coins_earned: coins,
  world,
});

Deno.test('p1 wins by 87 → knockout, +21 bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'gym'),
      mkLog('p1', 50, 'household'),
      mkLog('p2', 63, 'reading'),
    ],
  });
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.p1Total, 150);
  assertEquals(result.p2Total, 63);
  assertEquals(result.margin, 87);
  assertEquals(result.tributeTier, 'knockout');
  assertEquals(result.winnerBonusCoins, 21); // floor(87 * 0.25)
});

Deno.test('p2 wins → roles swap', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 10, 'gym'), mkLog('p2', 100, 'gym')],
  });
  assertEquals(result.winnerId, 'p2');
  assertEquals(result.loserId, 'p1');
  assertEquals(result.margin, 90);
});

Deno.test('tied → no winner, no tribute, no bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 50, 'gym'), mkLog('p2', 50, 'reading')],
  });
  assertEquals(result.winnerId, null);
  assertEquals(result.loserId, null);
  assertEquals(result.margin, 0);
  assertEquals(result.tributeTier, null);
  assertEquals(result.winnerBonusCoins, 0);
});

Deno.test('loser logged 0 → flawless override regardless of margin', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 30, 'gym')],
  });
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.margin, 30);
  assertEquals(result.tributeTier, 'flawless'); // overrides paper_cut
});

Deno.test('winner takes 5+ of 6 worlds → flawless override', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'gym'),
      mkLog('p1', 100, 'aerobics'),
      mkLog('p1', 100, 'university'),
      mkLog('p1', 100, 'diet'),
      mkLog('p1', 100, 'household'),
      mkLog('p2', 50, 'reading'), // p2 only takes 1 world
    ],
  });
  assertEquals(result.tributeTier, 'flawless');
});

Deno.test('winner bonus coin cap at 500', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 5000, 'gym'), mkLog('p2', 100, 'gym')],
  });
  assertEquals(result.margin, 4900);
  assertEquals(result.winnerBonusCoins, 500); // capped, not 1225
});

Deno.test('null p2Id (solo couple) → returns no-close marker', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: null,
    logs: [mkLog('p1', 100, 'gym')],
  });
  assertEquals(result.skipReason, 'solo_couple');
});

Deno.test('crowns_json reflects per-world winner', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'gym'),
      mkLog('p2', 50, 'gym'),
      mkLog('p2', 100, 'reading'),
    ],
  });
  assertEquals(result.crownsJson, { gym: 'p1', reading: 'p2' });
});
