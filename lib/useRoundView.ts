import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import {
  ensureActiveRound,
  loadCouplePlayers,
  loadRecentLogs,
  loadRoundStats,
  secondsUntilRoundEnd,
  type RoundStats,
} from './round';
import type { Couple, Log, Player, Round } from './types';

export type AttackEvent = {
  id: string;
  playerId: string;
  coinsEarned: number;
  loggedAt: string;
};

export type RoundView = {
  round: Round | null;
  p1: Player | null;
  p2: Player | null;
  stats: RoundStats | null;
  recentLogs: Log[];
  countdownSeconds: number;
  lastEvent: AttackEvent | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Optimistically fold a log row into stats/recentLogs/lastEvent. Dedupes by
   * row id so realtime inserts that arrive later become a no-op. Call this
   * right after a local strike so the scoreboard jumps immediately instead of
   * waiting on the realtime round-trip (which may be disabled for this table).
   */
  applyLog: (row: Log) => void;
};

/**
 * Subscribes the caller to their couple's current round: ensures a round
 * exists, loads both fighters + their score totals, pulls the last few logs,
 * and streams new log inserts in real-time as "attack events" for animation.
 */
export function useRoundView(couple: Couple | null): RoundView {
  const [round, setRound] = useState<Round | null>(null);
  const [p1, setP1] = useState<Player | null>(null);
  const [p2, setP2] = useState<Player | null>(null);
  const [stats, setStats] = useState<RoundStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<Log[]>([]);
  const [lastEvent, setLastEvent] = useState<AttackEvent | null>(null);
  const [countdownSeconds, setCountdown] = useState(0);
  const [loading, setLoading] = useState(true);

  const roundRef = useRef<Round | null>(null);
  const p1Ref = useRef<string | null>(null);
  const p2Ref = useRef<string | null>(null);
  const appliedLogIdsRef = useRef<Set<string>>(new Set());

  // Each hook instance needs its own realtime channel — Supabase dedupes by
  // name, so Home + Menu both asking for `round-logs-${couple.id}` would
  // collide (second caller's `.on()` runs after the first `.subscribe()`).
  const channelIdRef = useRef<string>('');
  if (!channelIdRef.current) {
    channelIdRef.current = Math.random().toString(36).slice(2, 10);
  }

  const refresh = useCallback(async () => {
    if (!couple) return;
    const { p1: A, p2: B } = await loadCouplePlayers(couple.id);
    setP1(A);
    setP2(B);
    p1Ref.current = A?.id ?? null;
    p2Ref.current = B?.id ?? null;

    const r = await ensureActiveRound(couple.id);
    // If ensureActiveRound transiently returns null (concurrent racers losing
    // on insert, network flake), keep the previously-known round rather than
    // clobbering state with null — otherwise the scoreboard countdown snaps
    // to 0m and applyLog starts dropping strikes on round-id mismatch.
    if (r) {
      roundRef.current = r;
      setRound(r);
    }

    const effectiveRound = r ?? roundRef.current;
    if (effectiveRound && A) {
      const s = await loadRoundStats(effectiveRound.id, A.id, B?.id ?? null);
      setStats(s);
      const logs = await loadRecentLogs(effectiveRound.id, 6);
      setRecentLogs(logs);
      // Seed the applied set so optimistic pre-applies don't get re-folded
      // when their realtime echo arrives. refresh is the fresh source of truth.
      appliedLogIdsRef.current = new Set(logs.map((l) => l.id));
    } else if (!effectiveRound) {
      setStats(null);
      setRecentLogs([]);
      appliedLogIdsRef.current = new Set();
    }
    setCountdown(secondsUntilRoundEnd(effectiveRound));
    setLoading(false);
  }, [couple]);

  const applyLog = useCallback((row: Log) => {
    // We don't gate on roundRef.current.id matching — the strike writer
    // (useStrikeSelect) and useRoundView each call ensureActiveRound and can
    // briefly settle on different round rows during a race. Dropping the log
    // on id mismatch would silently stall the scoreboard; dedupe on row.id
    // is enough to keep realtime echoes from double-counting.
    if (appliedLogIdsRef.current.has(row.id)) return;
    appliedLogIdsRef.current.add(row.id);
    const p1Id = p1Ref.current;
    const p2Id = p2Ref.current;
    setStats((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (row.player_id === p1Id) {
        next.p1 = {
          ...next.p1,
          score: next.p1.score + (row.coins_earned ?? 0),
          logCount: next.p1.logCount + 1,
          lastLogAt: row.logged_at,
        };
      } else if (row.player_id === p2Id && next.p2) {
        next.p2 = {
          ...next.p2,
          score: next.p2.score + (row.coins_earned ?? 0),
          logCount: next.p2.logCount + 1,
          lastLogAt: row.logged_at,
        };
      }
      const p2Score = next.p2?.score ?? 0;
      next.margin = next.p1.score - p2Score;
      next.leader =
        next.p2 == null
          ? 'p1'
          : next.margin > 0
          ? 'p1'
          : next.margin < 0
          ? 'p2'
          : 'tied';
      return next;
    });
    setRecentLogs((prev) => {
      if (prev.some((l) => l.id === row.id)) return prev;
      return [row, ...prev].slice(0, 6);
    });
    setLastEvent({
      id: row.id,
      playerId: row.player_id,
      coinsEarned: row.coins_earned ?? 0,
      loggedAt: row.logged_at,
    });
  }, []);

  // Initial + couple change
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Realtime logs subscription. Folds inserts through applyLog so local
  // optimistic applies dedupe against their own echo.
  useEffect(() => {
    if (!couple) return;
    const channel = supabase
      .channel(`round-logs-${couple.id}-${channelIdRef.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs',
        },
        (payload) => {
          applyLog(payload.new as Log);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [couple, applyLog]);

  // Countdown tick. Skip if we don't have a round yet — otherwise we'd
  // overwrite a live countdown with 0m during a transient null-round state.
  useEffect(() => {
    const t = setInterval(() => {
      if (!roundRef.current) return;
      setCountdown(secondsUntilRoundEnd(roundRef.current));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  return {
    round,
    p1,
    p2,
    stats,
    recentLogs,
    countdownSeconds,
    lastEvent,
    loading,
    refresh,
    applyLog,
  };
}
