import {
  tierForMargin,
  tierForFlawlessOverride,
  type TributeTier,
} from './tribute-tiers.ts';

export type LogForClose = {
  player_id: string;
  coins_earned: number;
  world: string;
};

export type CloseResult =
  | {
      skipReason: 'solo_couple';
      p1Total?: never;
      p2Total?: never;
      winnerId?: never;
      loserId?: never;
      margin?: never;
      tributeTier?: never;
      winnerBonusCoins?: never;
      crownsJson?: never;
    }
  | {
      skipReason?: never;
      p1Total: number;
      p2Total: number;
      winnerId: string | null;
      loserId: string | null;
      margin: number;
      tributeTier: TributeTier | null;
      winnerBonusCoins: number;
      crownsJson: Record<string, string>;
    };

const BONUS_RATE = 0.25;
const BONUS_CAP = 500;

export function computeCloseResult(input: {
  p1Id: string;
  p2Id: string | null;
  logs: LogForClose[];
}): CloseResult {
  if (!input.p2Id) return { skipReason: 'solo_couple' };

  // Per-player totals
  let p1Total = 0;
  let p2Total = 0;
  for (const l of input.logs) {
    if (l.player_id === input.p1Id) p1Total += l.coins_earned ?? 0;
    else if (l.player_id === input.p2Id) p2Total += l.coins_earned ?? 0;
  }

  // Crowns: per-world winner by score
  const worldScores = new Map<string, { p1: number; p2: number }>();
  for (const l of input.logs) {
    const ws = worldScores.get(l.world) ?? { p1: 0, p2: 0 };
    if (l.player_id === input.p1Id) ws.p1 += l.coins_earned ?? 0;
    else if (l.player_id === input.p2Id) ws.p2 += l.coins_earned ?? 0;
    worldScores.set(l.world, ws);
  }
  const crownsJson: Record<string, string> = {};
  let p1WorldCount = 0;
  let p2WorldCount = 0;
  for (const [world, scores] of worldScores) {
    if (scores.p1 > scores.p2) {
      crownsJson[world] = input.p1Id;
      p1WorldCount++;
    } else if (scores.p2 > scores.p1) {
      crownsJson[world] = input.p2Id;
      p2WorldCount++;
    }
    // ties on a world: no crown awarded for that world
  }

  const margin = Math.abs(p1Total - p2Total);
  let winnerId: string | null = null;
  let loserId: string | null = null;
  let winnerLogCount = 0;
  let loserLogCount = 0;
  let winnerWorldCount = 0;

  if (p1Total > p2Total) {
    winnerId = input.p1Id;
    loserId = input.p2Id;
    winnerWorldCount = p1WorldCount;
  } else if (p2Total > p1Total) {
    winnerId = input.p2Id;
    loserId = input.p1Id;
    winnerWorldCount = p2WorldCount;
  }

  if (winnerId) {
    for (const l of input.logs) {
      if (l.player_id === winnerId) winnerLogCount++;
      else if (l.player_id === loserId) loserLogCount++;
    }
  }

  let tributeTier: TributeTier | null = null;
  if (winnerId) {
    tributeTier =
      tierForFlawlessOverride({
        loserLogCount,
        winnerWorldCount,
        totalContestedWorlds: worldScores.size,
      }) ?? tierForMargin(margin);
  }

  const winnerBonusCoins = winnerId
    ? Math.min(Math.floor(margin * BONUS_RATE), BONUS_CAP)
    : 0;

  return {
    p1Total,
    p2Total,
    winnerId,
    loserId,
    margin,
    tributeTier,
    winnerBonusCoins,
    crownsJson,
  };
}
