import {
  tierForMargin,
  tierForFlawlessOverride,
  type TributeTier,
} from './tribute-tiers.ts';

export type LogForClose = {
  player_id: string;
  round_value_earned: number;
  world: string;
};

export type CloseStatus = 'closed' | 'inactive';

export type CloseResult =
  | {
      skipReason: 'solo_couple';
      status?: never;
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
      status: CloseStatus;
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
const DEAD_ROUND_THRESHOLD = 50;
const HOUSEHOLD_WORLD = 'household';

export function computeCloseResult(input: {
  p1Id: string;
  p2Id: string | null;
  logs: LogForClose[];
}): CloseResult {
  if (!input.p2Id) return { skipReason: 'solo_couple' };

  let p1Total = 0;
  let p2Total = 0;
  for (const l of input.logs) {
    if (l.player_id === input.p1Id) p1Total += l.round_value_earned ?? 0;
    else if (l.player_id === input.p2Id) p2Total += l.round_value_earned ?? 0;
  }

  // Crowns: per-world winner.
  //   - Household: by round_value_earned (only world with chore points).
  //   - Other worlds: by log count (dominance/engagement) since non-household
  //     logs have round_value_earned = 0 under dual-currency.
  // Ties → no crown awarded for that world.
  const worldStats = new Map<
    string,
    { p1Value: number; p2Value: number; p1Logs: number; p2Logs: number }
  >();
  for (const l of input.logs) {
    const ws = worldStats.get(l.world) ?? {
      p1Value: 0,
      p2Value: 0,
      p1Logs: 0,
      p2Logs: 0,
    };
    if (l.player_id === input.p1Id) {
      ws.p1Value += l.round_value_earned ?? 0;
      ws.p1Logs++;
    } else if (l.player_id === input.p2Id) {
      ws.p2Value += l.round_value_earned ?? 0;
      ws.p2Logs++;
    }
    worldStats.set(l.world, ws);
  }
  const crownsJson: Record<string, string> = {};
  let p1WorldCount = 0;
  let p2WorldCount = 0;
  for (const [world, stats] of worldStats) {
    const p1Metric = world === HOUSEHOLD_WORLD ? stats.p1Value : stats.p1Logs;
    const p2Metric = world === HOUSEHOLD_WORLD ? stats.p2Value : stats.p2Logs;
    if (p1Metric > p2Metric) {
      crownsJson[world] = input.p1Id;
      p1WorldCount++;
    } else if (p2Metric > p1Metric) {
      crownsJson[world] = input.p2Id;
      p2WorldCount++;
    }
  }

  // Dead-round check: if neither player cleared the threshold, close INACTIVE.
  if (Math.max(p1Total, p2Total) < DEAD_ROUND_THRESHOLD) {
    return {
      status: 'inactive',
      p1Total,
      p2Total,
      winnerId: null,
      loserId: null,
      margin: 0,
      tributeTier: null,
      winnerBonusCoins: 0,
      crownsJson,
    };
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
        totalContestedWorlds: worldStats.size,
      }) ?? tierForMargin(margin);
  }

  const winnerBonusCoins = winnerId
    ? Math.min(Math.floor(margin * BONUS_RATE), BONUS_CAP)
    : 0;

  return {
    status: 'closed',
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
