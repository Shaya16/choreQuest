import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCloseResult, type LogForClose } from './round-close.ts';

const mkLog = (player_id: string, roundPts: number, world: string): LogForClose => ({
  player_id,
  round_value_earned: roundPts,
  world,
});

Deno.test('p1 wins by 87 → knockout, +21 bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'household'),
      mkLog('p1', 50, 'household'),
      mkLog('p2', 63, 'household'),
    ],
  });
  assertEquals(result.status, 'closed');
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.p1Total, 150);
  assertEquals(result.p2Total, 63);
  assertEquals(result.margin, 87);
  assertEquals(result.tributeTier, 'knockout');
  assertEquals(result.winnerBonusCoins, 21);
});

Deno.test('p2 wins → roles swap', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 100, 'household'), mkLog('p2', 200, 'household')],
  });
  assertEquals(result.winnerId, 'p2');
  assertEquals(result.loserId, 'p1');
  assertEquals(result.margin, 100);
});

Deno.test('tied above threshold → no winner, no tribute, no bonus', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 60, 'household'), mkLog('p2', 60, 'household')],
  });
  assertEquals(result.status, 'closed');
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
    logs: [mkLog('p1', 80, 'household')],
  });
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.loserId, 'p2');
  assertEquals(result.margin, 80);
  assertEquals(result.tributeTier, 'flawless');
});

Deno.test('winner takes 5+ of 6 worlds → flawless override (non-household counts for crowns)', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 0, 'gym'),
      mkLog('p1', 0, 'aerobics'),
      mkLog('p1', 0, 'university'),
      mkLog('p1', 0, 'diet'),
      mkLog('p1', 60, 'household'),
      mkLog('p2', 0, 'reading'),
    ],
  });
  assertEquals(result.tributeTier, 'flawless');
});

Deno.test('winner bonus coin cap at 500', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 5000, 'household'), mkLog('p2', 100, 'household')],
  });
  assertEquals(result.margin, 4900);
  assertEquals(result.winnerBonusCoins, 500);
});

Deno.test('null p2Id (solo couple) → returns no-close marker', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: null,
    logs: [mkLog('p1', 100, 'household')],
  });
  assertEquals(result.skipReason, 'solo_couple');
});

Deno.test('crowns_json reflects per-world winner using round pts', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 100, 'household'),
      mkLog('p2', 50, 'household'),
    ],
  });
  assertEquals(result.crownsJson, { household: 'p1' });
});

// --- NEW tests for dual-currency + dead-round ------------------------------

Deno.test('both below dead-round threshold → status inactive, no tribute', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 30, 'household'), mkLog('p2', 40, 'household')],
  });
  assertEquals(result.status, 'inactive');
  assertEquals(result.winnerId, null);
  assertEquals(result.loserId, null);
  assertEquals(result.tributeTier, null);
  assertEquals(result.winnerBonusCoins, 0);
});

Deno.test('one above, one below threshold → round still closes', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [mkLog('p1', 60, 'household'), mkLog('p2', 30, 'household')],
  });
  assertEquals(result.status, 'closed');
  assertEquals(result.winnerId, 'p1');
  assertEquals(result.margin, 30);
  assertEquals(result.tributeTier, 'paper_cut');
});

Deno.test('non-chore logs sum to 0 round score', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 0, 'gym'),
      mkLog('p1', 0, 'gym'),
      mkLog('p1', 0, 'gym'),
      mkLog('p1', 10, 'household'),
      mkLog('p2', 80, 'household'),
    ],
  });
  assertEquals(result.status, 'closed');
  assertEquals(result.p1Total, 10);
  assertEquals(result.p2Total, 80);
  assertEquals(result.winnerId, 'p2');
});

Deno.test('legacy pre-migration logs contribute 0 to round score', () => {
  const result = computeCloseResult({
    p1Id: 'p1',
    p2Id: 'p2',
    logs: [
      mkLog('p1', 0, 'household'),
      mkLog('p1', 60, 'household'),
      mkLog('p2', 50, 'household'),
    ],
  });
  assertEquals(result.p1Total, 60);
  assertEquals(result.p2Total, 50);
});
