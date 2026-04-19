import { fromZonedTime } from 'date-fns-tz';

import { supabase } from './supabase';
import { WORLD_META } from './worlds';
import { PRIMARY_TZ, todayInPrimaryTz } from './timezone';
import type { Activity, Log, Player, World } from './types';

/**
 * Today's local-day window expressed as UTC instants. We can't just slap
 * `T00:00:00Z` onto the local date string — that pins the window to UTC
 * midnight, which is 2–3h *after* Jerusalem midnight. Strikes made in the
 * first 2–3h of a Jerusalem day would land before startIso and get dropped,
 * so reloading the app would show ammo "reset" and let the user bust the
 * daily cap. fromZonedTime maps local-clock → UTC instant correctly.
 */
function todayBoundsUtc(): { startIso: string; endIso: string } {
  const today = todayInPrimaryTz();
  return {
    startIso: fromZonedTime(`${today}T00:00:00`, PRIMARY_TZ).toISOString(),
    endIso: fromZonedTime(`${today}T23:59:59.999`, PRIMARY_TZ).toISOString(),
  };
}

export type ComputedLogValues = {
  base_value: number;
  player_multiplier: number;
  combo_multiplier: number;
  crit_multiplier: number;
  daily_bonus_multiplier: number;
  weekly_hero_multiplier: number;
  season_multiplier: number;
  coins_earned: number;
  xp_earned: number;
  jackpot_share: number;
  personal_share: number;
};

/**
 * Compute coin / xp / multipliers for a single strike.
 * v1 only wires player mult + combo mult; the rest of the schema multipliers
 * (crit/daily/weekly/season) stay at 1.0 until their systems activate.
 */
export function computeLogValues(
  activity: Activity,
  player: Player
): ComputedLogValues {
  const rawBase = (activity.base_value ?? 0) + (activity.bonus ?? 0);
  const mk = WORLD_META[activity.world].multKey;
  const playerMult = Number(player[mk] ?? 1) || 1;
  const comboMult = player.combo_multiplier ?? 1;
  const critMult = 1;
  const dailyBonusMult = 1;
  const weeklyHeroMult = 1;
  const seasonMult = 1;

  const coins = Math.max(
    0,
    Math.floor(
      rawBase *
        playerMult *
        comboMult *
        critMult *
        dailyBonusMult *
        weeklyHeroMult *
        seasonMult
    )
  );

  return {
    base_value: rawBase,
    player_multiplier: playerMult,
    combo_multiplier: comboMult,
    crit_multiplier: critMult,
    daily_bonus_multiplier: dailyBonusMult,
    weekly_hero_multiplier: weeklyHeroMult,
    season_multiplier: seasonMult,
    coins_earned: coins,
    xp_earned: rawBase,
    jackpot_share: 0,
    personal_share: coins,
  };
}

export async function createLog(args: {
  activity: Activity;
  player: Player;
  roundId: string;
}): Promise<Log | null> {
  const values = computeLogValues(args.activity, args.player);
  const { data, error } = await supabase
    .from('logs')
    .insert({
      player_id: args.player.id,
      activity_id: args.activity.id,
      round_id: args.roundId,
      evidence_url: null,
      notes: null,
      ...values,
    })
    .select('*')
    .single<Log>();
  if (error) {
    console.warn('createLog failed', error);
    return null;
  }
  return data;
}

/**
 * Fetch all non-custom activities + any custom ones this couple owns.
 * RLS already enforces the custom filter; we just read everything.
 */
export async function loadActivities(): Promise<Activity[]> {
  const { data } = await supabase
    .from('activities')
    .select('*')
    .eq('is_active', true)
    .order('world', { ascending: true })
    .order('tier', { ascending: true, nullsFirst: true })
    .order('base_value', { ascending: false });
  return (data ?? []) as Activity[];
}

/**
 * Returns { activityId → count } for the player's logs created today
 * (in the primary timezone). Used to enforce per-activity daily_cap.
 */
export async function loadTodayCounts(
  playerId: string
): Promise<Record<string, number>> {
  const { startIso, endIso } = todayBoundsUtc();
  const { data } = await supabase
    .from('logs')
    .select('activity_id')
    .eq('player_id', playerId)
    .gte('logged_at', startIso)
    .lte('logged_at', endIso);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { activity_id: string }[]) {
    counts[row.activity_id] = (counts[row.activity_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Running haul for TODAY across all activities (for the HUD ticker).
 */
export async function loadTodayHaul(playerId: string): Promise<{
  coins: number;
  xp: number;
  strikes: number;
}> {
  const { startIso, endIso } = todayBoundsUtc();
  const { data } = await supabase
    .from('logs')
    .select('coins_earned, xp_earned')
    .eq('player_id', playerId)
    .gte('logged_at', startIso)
    .lte('logged_at', endIso);
  const rows = (data ?? []) as Pick<Log, 'coins_earned' | 'xp_earned'>[];
  return {
    coins: rows.reduce((a, r) => a + (r.coins_earned ?? 0), 0),
    xp: rows.reduce((a, r) => a + (r.xp_earned ?? 0), 0),
    strikes: rows.length,
  };
}

export function groupByWorld(
  activities: Activity[]
): Record<World, Activity[]> {
  const groups: Record<World, Activity[]> = {
    gym: [],
    aerobics: [],
    university: [],
    diet: [],
    household: [],
    reading: [],
  };
  for (const a of activities) groups[a.world].push(a);
  return groups;
}
