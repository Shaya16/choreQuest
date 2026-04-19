// =============================================================================
// Runs every 30 minutes from pg_cron. Fires the two time-driven triggers
// (end-of-day reminder, inactivity nudge) when the Jerusalem-local window
// matches and the player's daily state qualifies.
// =============================================================================
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { VARIANTS } from '../_shared/variants.ts';
import { pickVariant } from '../_shared/variant-picker.ts';
import { isQuietHours, jerusalemHourAt, PRIMARY_TZ } from '../_shared/quiet-hours.ts';
import { sendPush } from '../_shared/expo-push.ts';

const COOLDOWN_MS = 30 * 60 * 1000;
const END_OF_DAY_MIN_UNUSED = 5;

Deno.serve(async () => {
  if (isQuietHours()) return new Response('quiet hours', { status: 200 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const now = new Date();
  const hour = jerusalemHourAt(now);
  const today = todayInJerusalem(now);

  const isInactivityWindow = hour === 15;
  const isEndOfDayWindow = hour === 19;
  if (!isInactivityWindow && !isEndOfDayWindow) {
    return new Response('not a window', { status: 200 });
  }

  const { data: players } = await admin
    .from('players')
    .select('*')
    .not('expo_push_token', 'is', null);

  for (const player of (players ?? [])) {
    if (isInactivityWindow) await tryInactivity(admin, player, today);
    if (isEndOfDayWindow) await tryEndOfDay(admin, player, today);
  }

  return new Response('ok', { status: 200 });
});

function todayInJerusalem(now: Date): string {
  // 'en-CA' renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: PRIMARY_TZ }).format(now);
}

function getJerusalemOffsetMinutes(at: Date): number {
  const utcHour = at.getUTCHours();
  const jerusalemHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PRIMARY_TZ,
      hour: 'numeric',
      hour12: false,
    }).format(at)
  );
  let diff = jerusalemHour - utcHour;
  if (diff < -12) diff += 24;
  if (diff > 12) diff -= 24;
  return diff * 60;
}

function jerusalemDayBoundsUtc(today: string): { start: string; end: string } {
  const midnightLocalAsUtc = new Date(`${today}T00:00:00Z`);
  const jerusalemOffsetMin = getJerusalemOffsetMinutes(midnightLocalAsUtc);
  const start = new Date(midnightLocalAsUtc.getTime() - jerusalemOffsetMin * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function tryInactivity(
  admin: SupabaseClient,
  player: {
    id: string;
    display_name: string;
    couple_id: string | null;
    expo_push_token: string | null;
  },
  today: string
) {
  if (!player.expo_push_token) return;

  const { data: state } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', player.id)
    .eq('trigger_type', 'inactivity')
    .maybeSingle();
  if (state?.dedup_date === today) return;
  if (state?.last_fired_at) {
    const age = Date.now() - new Date(state.last_fired_at).getTime();
    if (age < COOLDOWN_MS) return;
  }

  const { start, end } = jerusalemDayBoundsUtc(today);
  const { count: myCount } = await admin
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', player.id)
    .gte('logged_at', start)
    .lte('logged_at', end);
  if ((myCount ?? 0) > 0) return;

  let partnerName = 'partner';
  let partnerCount = 0;
  if (player.couple_id) {
    const { data: partner } = await admin
      .from('players')
      .select('id, display_name')
      .eq('couple_id', player.couple_id)
      .neq('id', player.id)
      .maybeSingle();
    if (partner) {
      partnerName = partner.display_name.toLowerCase();
      const { count: pc } = await admin
        .from('logs')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', partner.id)
        .gte('logged_at', start)
        .lte('logged_at', end);
      partnerCount = pc ?? 0;
    }
  }

  const { text, index } = pickVariant(
    VARIANTS.inactivity,
    state?.last_variant_index ?? null,
    { partner: partnerName, partner_count: partnerCount }
  );
  const result = await sendPush({
    to: player.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });
  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: player.id,
      trigger_type: 'inactivity',
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
      dedup_date: today,
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', player.id);
  }
}

async function tryEndOfDay(
  admin: SupabaseClient,
  player: { id: string; expo_push_token: string | null },
  today: string
) {
  if (!player.expo_push_token) return;

  const { data: state } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', player.id)
    .eq('trigger_type', 'end_of_day')
    .maybeSingle();
  if (state?.dedup_date === today) return;
  if (state?.last_fired_at) {
    const age = Date.now() - new Date(state.last_fired_at).getTime();
    if (age < COOLDOWN_MS) return;
  }

  const { start, end } = jerusalemDayBoundsUtc(today);
  const { data: activities } = await admin
    .from('activities')
    .select('id, daily_cap')
    .eq('is_active', true)
    .is('archived_at', null)
    .gt('daily_cap', 0);
  const { data: todayLogs } = await admin
    .from('logs')
    .select('activity_id')
    .eq('player_id', player.id)
    .gte('logged_at', start)
    .lte('logged_at', end);
  const counts: Record<string, number> = {};
  for (const l of (todayLogs ?? [])) {
    counts[l.activity_id] = (counts[l.activity_id] ?? 0) + 1;
  }
  let unused = 0;
  for (const a of (activities ?? [])) {
    const used = counts[a.id] ?? 0;
    unused += Math.max(0, (a.daily_cap ?? 0) - used);
  }
  if (unused < END_OF_DAY_MIN_UNUSED) return;

  const { text, index } = pickVariant(
    VARIANTS.end_of_day,
    state?.last_variant_index ?? null,
    { n: unused }
  );
  const result = await sendPush({
    to: player.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });
  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: player.id,
      trigger_type: 'end_of_day',
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
      dedup_date: today,
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', player.id);
  }
}
