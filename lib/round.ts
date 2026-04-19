import { supabase } from './supabase';
import type { Log, Player, Round } from './types';

function addDaysISO(baseISO: string, days: number): string {
  const d = new Date(baseISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns the couple's current active round, creating one if none exists.
 * A round spans 7 days starting today.
 */
export async function ensureActiveRound(coupleId: string): Promise<Round | null> {
  // Read with .limit(1) — never .maybeSingle()/.single() here. If duplicates
  // ever slip through (race on initial insert, manual DB tinkering), the
  // single-row readers throw and callers fall through to insert *more*
  // duplicates, compounding forever. .limit(1) tolerates that state.
  const { data: existingList } = await supabase
    .from('rounds')
    .select('*')
    .eq('couple_id', coupleId)
    .eq('status', 'active')
    .order('number', { ascending: false })
    .limit(1);
  const existing = (existingList?.[0] ?? null) as Round | null;
  if (existing) return existing;

  const { data: lastList } = await supabase
    .from('rounds')
    .select('number')
    .eq('couple_id', coupleId)
    .order('number', { ascending: false })
    .limit(1);
  const last = (lastList?.[0] ?? null) as { number: number } | null;

  const nextNumber = (last?.number ?? 0) + 1;
  const start = todayISO();
  const end = addDaysISO(start, 7);

  const { data: created, error } = await supabase
    .from('rounds')
    .insert({
      couple_id: coupleId,
      number: nextNumber,
      start_date: start,
      end_date: end,
      status: 'active',
    })
    .select('*')
    .single<Round>();

  // If the insert lost the race (unique partial index on (couple_id) where
  // status='active' rejects the second writer), re-read and return whatever
  // the winner created. That's the round we all want to agree on.
  if (error) {
    const { data: winnerList } = await supabase
      .from('rounds')
      .select('*')
      .eq('couple_id', coupleId)
      .eq('status', 'active')
      .order('number', { ascending: false })
      .limit(1);
    return (winnerList?.[0] ?? null) as Round | null;
  }
  return created;
}

export type FighterStats = {
  playerId: string;
  score: number;
  logCount: number;
  lastLogAt: string | null;
};

export type RoundStats = {
  p1: FighterStats;
  p2: FighterStats | null;
  margin: number; // p1 - p2 (null p2 => margin=p1)
  leader: 'p1' | 'p2' | 'tied';
};

export async function loadRoundStats(
  roundId: string,
  p1Id: string,
  p2Id: string | null
): Promise<RoundStats> {
  const { data: logs } = await supabase
    .from('logs')
    .select('player_id, round_value_earned, logged_at')
    .eq('round_id', roundId)
    .order('logged_at', { ascending: false });

  const rows = (logs ?? []) as Pick<Log, 'player_id' | 'round_value_earned' | 'logged_at'>[];

  function statsFor(id: string | null): FighterStats | null {
    if (!id) return null;
    let score = 0;
    let lastLogAt: string | null = null;
    let logCount = 0;
    for (const r of rows) {
      if (r.player_id === id) {
        score += r.round_value_earned ?? 0;
        logCount += 1;
        if (!lastLogAt) lastLogAt = r.logged_at;
      }
    }
    return { playerId: id, score, logCount, lastLogAt };
  }

  const p1 = statsFor(p1Id)!;
  const p2 = statsFor(p2Id);
  const p2Score = p2?.score ?? 0;
  const margin = p1.score - p2Score;
  const leader: 'p1' | 'p2' | 'tied' =
    p2 == null ? 'p1' : margin > 0 ? 'p1' : margin < 0 ? 'p2' : 'tied';

  return { p1, p2, margin, leader };
}

/**
 * Seconds until the round's end_date (midnight UTC). Never negative.
 */
export function secondsUntilRoundEnd(round: Round | null): number {
  if (!round) return 0;
  const end = new Date(round.end_date + 'T23:59:59Z').getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((end - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export async function loadCouplePlayers(
  coupleId: string
): Promise<{ p1: Player | null; p2: Player | null; players: Player[] }> {
  const { data } = await supabase
    .from('players')
    .select('*')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: true });

  const list = (data ?? []) as Player[];
  return { p1: list[0] ?? null, p2: list[1] ?? null, players: list };
}

export async function loadRecentLogs(
  roundId: string,
  limit: number = 6
): Promise<Log[]> {
  const { data } = await supabase
    .from('logs')
    .select('*')
    .eq('round_id', roundId)
    .order('logged_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as Log[];
}
