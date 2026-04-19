import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createLog,
  groupByWorld,
  loadTodayCounts,
  loadTodayHaul,
} from './logger';
import { ensureActiveRound } from './round';
import { useSession } from './store';
import { supabase } from './supabase';
import type { Activity, Couple, Log, Player, World } from './types';

export type TodayHaul = {
  coins: number;
  xp: number;
  strikes: number;
};

export type StrikeSelect = {
  activities: Record<World, Activity[]>;
  todayCounts: Record<string, number>;
  todayHaul: TodayHaul;
  roundId: string | null;
  loading: boolean;
  lastStrike: { activityId: string; coins: number; at: number } | null;
  /** Returns the new log row on success, or null on failure / cap hit. */
  strike: (activity: Activity) => Promise<Log | null>;
  refresh: () => Promise<void>;
};

const EMPTY_GROUPS: Record<World, Activity[]> = {
  gym: [],
  aerobics: [],
  university: [],
  diet: [],
  household: [],
  reading: [],
};

/**
 * Reads cached activities from the store (loaded once at boot), fetches
 * today's counts + running haul + active round, and owns the strike flow.
 * Subscribes to log INSERTs so partner/other-device writes don't desync.
 */
export function useStrikeSelect(
  player: Player | null,
  couple: Couple | null
): StrikeSelect {
  const cachedActivities = useSession((s) => s.activities);

  const activities = useMemo(
    () =>
      cachedActivities.length === 0
        ? EMPTY_GROUPS
        : groupByWorld(cachedActivities),
    [cachedActivities]
  );

  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({});
  const [todayHaul, setTodayHaul] = useState<TodayHaul>({
    coins: 0,
    xp: 0,
    strikes: 0,
  });
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastStrike, setLastStrike] = useState<StrikeSelect['lastStrike']>(null);

  const playerIdRef = useRef<string | null>(null);
  playerIdRef.current = player?.id ?? null;

  const refresh = useCallback(async () => {
    if (!player || !couple) {
      setLoading(false);
      return;
    }
    const [counts, haul, round] = await Promise.all([
      loadTodayCounts(player.id),
      loadTodayHaul(player.id),
      ensureActiveRound(couple.id),
    ]);
    setTodayCounts(counts);
    setTodayHaul(haul);
    setRoundId(round?.id ?? null);
    setLoading(false);
  }, [player, couple]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Realtime: if a log row arrives for us, bump our local counts/haul.
  useEffect(() => {
    if (!player) return;
    const channel = supabase
      .channel(`strike-select-${player.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs',
        },
        (payload) => {
          const row = payload.new as Log;
          if (row.player_id !== playerIdRef.current) return;
          setTodayCounts((prev) => ({
            ...prev,
            [row.activity_id]: (prev[row.activity_id] ?? 0) + 1,
          }));
          setTodayHaul((prev) => ({
            coins: prev.coins + (row.coins_earned ?? 0),
            xp: prev.xp + (row.xp_earned ?? 0),
            strikes: prev.strikes + 1,
          }));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [player]);

  const strike = useCallback(
    async (activity: Activity): Promise<Log | null> => {
      if (!player || !roundId) return null;
      const used = todayCounts[activity.id] ?? 0;
      if (used >= activity.daily_cap) return null;

      // Optimistic local bump so the UI feels instant; realtime will reconcile.
      setTodayCounts((prev) => ({
        ...prev,
        [activity.id]: used + 1,
      }));

      const row = await createLog({ activity, player, roundId });

      if (!row) {
        // Rollback on failure.
        setTodayCounts((prev) => ({
          ...prev,
          [activity.id]: Math.max(0, (prev[activity.id] ?? 1) - 1),
        }));
        return null;
      }

      setLastStrike({
        activityId: activity.id,
        coins: row.coins_earned ?? 0,
        at: Date.now(),
      });
      // haul is updated via realtime subscription, no local bump needed here
      return row;
    },
    [player, roundId, todayCounts]
  );

  return {
    activities,
    todayCounts,
    todayHaul,
    roundId,
    loading,
    lastStrike,
    strike,
    refresh,
  };
}
