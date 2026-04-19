// =============================================================================
// Runs every 10 minutes Sun→Mon from pg_cron. Closes any active round whose
// end_date has passed in Asia/Jerusalem, opens the next round, and pushes the
// per-role notifications (winner / loser / tied) directly via Expo.
// =============================================================================
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeCloseResult, type LogForClose } from '../_shared/round-close.ts';
import { VARIANTS } from '../_shared/variants.ts';
import { pickVariant } from '../_shared/variant-picker.ts';
import { isQuietHours, PRIMARY_TZ } from '../_shared/quiet-hours.ts';
import { sendPush } from '../_shared/expo-push.ts';

type RoundRow = {
  id: string;
  couple_id: string;
  number: number;
  start_date: string;
  end_date: string;
  status: string;
};

type PlayerRow = {
  id: string;
  couple_id: string;
  display_name: string;
  expo_push_token: string | null;
};

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const todayJerusalem = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRIMARY_TZ,
  }).format(new Date());

  // Find every active round whose end_date has passed in Jerusalem.
  const { data: dueRounds } = await admin
    .from('rounds')
    .select('*')
    .eq('status', 'active')
    .lt('end_date', todayJerusalem);

  let closedCount = 0;
  for (const round of (dueRounds ?? []) as RoundRow[]) {
    const closed = await closeOneRound(admin, round);
    if (closed) closedCount++;
  }
  return new Response(`closed=${closedCount}`, { status: 200 });
});

async function closeOneRound(admin: SupabaseClient, round: RoundRow): Promise<boolean> {
  // Load both players for this couple.
  const { data: playersData } = await admin
    .from('players')
    .select('*')
    .eq('couple_id', round.couple_id)
    .order('created_at', { ascending: true });
  const players = (playersData ?? []) as PlayerRow[];
  const p1 = players[0] ?? null;
  const p2 = players[1] ?? null;
  if (!p1) return false;

  // Load logs for this round with their world (joined from activities).
  const { data: rawLogs } = await admin
    .from('logs')
    .select('player_id, coins_earned, activities(world)')
    .eq('round_id', round.id);

  const logs: LogForClose[] = (rawLogs ?? []).map((r: {
    player_id: string;
    coins_earned: number | null;
    activities: { world: string } | { world: string }[] | null;
  }) => ({
    player_id: r.player_id,
    coins_earned: r.coins_earned ?? 0,
    world: Array.isArray(r.activities)
      ? r.activities[0]?.world ?? 'unknown'
      : r.activities?.world ?? 'unknown',
  }));

  const result = computeCloseResult({
    p1Id: p1.id,
    p2Id: p2?.id ?? null,
    logs,
  });

  if ('skipReason' in result && result.skipReason) {
    // Solo couple: don't close, don't push. Round just keeps rolling.
    return false;
  }

  // Atomic close (status guard prevents double-close).
  const { data: updated } = await admin
    .from('rounds')
    .update({
      status: 'closed',
      p1_total: result.p1Total,
      p2_total: result.p2Total,
      winner_id: result.winnerId,
      loser_id: result.loserId,
      margin: result.margin,
      tribute_tier: result.tributeTier,
      winner_bonus_coins: result.winnerBonusCoins,
      crowns_json: result.crownsJson,
    })
    .eq('id', round.id)
    .eq('status', 'active')
    .select('*');

  if (!updated || updated.length === 0) {
    // Lost the race; another tick already closed it.
    return false;
  }

  // Open the next round (Sun→Sat, 7 days starting today in Jerusalem).
  await openNextRound(admin, round);

  // Push to both players.
  if (!isQuietHours()) {
    await pushRoundOutcome(admin, p1, p2, result, round);
  }

  return true;
}

async function openNextRound(admin: SupabaseClient, prev: RoundRow): Promise<void> {
  const todayJerusalem = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRIMARY_TZ,
  }).format(new Date());
  const start = new Date(todayJerusalem + 'T00:00:00Z');
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 7);
  const endIso = end.toISOString().slice(0, 10);

  await admin.from('rounds').insert({
    couple_id: prev.couple_id,
    number: prev.number + 1,
    start_date: todayJerusalem,
    end_date: endIso,
    status: 'active',
  });
}

async function pushRoundOutcome(
  admin: SupabaseClient,
  p1: PlayerRow,
  p2: PlayerRow | null,
  result: Exclude<ReturnType<typeof computeCloseResult>, { skipReason: 'solo_couple' }>,
  round: RoundRow
): Promise<void> {
  const nextNumber = round.number + 1;

  // Tied case
  if (!result.winnerId) {
    for (const player of [p1, p2].filter((p): p is PlayerRow => !!p)) {
      if (!player.expo_push_token) continue;
      const partner = player.id === p1.id ? p2 : p1;
      const lastIndex = await readLastIndex(admin, player.id, 'round_tied');
      const pick = pickVariant(VARIANTS.round_tied, lastIndex, {
        n: round.number,
        next: nextNumber,
        partner: partner?.display_name ?? '???',
      });
      await sendPush({
        to: player.expo_push_token,
        title: 'ROUND TIED',
        body: pick.text,
        data: { screen: 'round_over', round_id: round.id },
      });
      await writeLastIndex(admin, player.id, 'round_tied', pick.index);
    }
    return;
  }

  // Decisive case
  const winner = result.winnerId === p1.id ? p1 : p2;
  const loser = result.loserId === p1.id ? p1 : p2;
  if (!winner || !loser) return;

  if (winner.expo_push_token) {
    const lastIndex = await readLastIndex(admin, winner.id, 'round_won');
    const pick = pickVariant(VARIANTS.round_won, lastIndex, {
      n: round.number,
      margin: result.margin,
      partner: loser.display_name,
    });
    await sendPush({
      to: winner.expo_push_token,
      title: 'K.O.',
      body: pick.text,
      data: { screen: 'round_over', round_id: round.id },
    });
    await writeLastIndex(admin, winner.id, 'round_won', pick.index);
  }

  if (loser.expo_push_token) {
    const lastIndex = await readLastIndex(admin, loser.id, 'round_lost');
    const pick = pickVariant(VARIANTS.round_lost, lastIndex, {
      n: round.number,
      margin: result.margin,
      partner: winner.display_name,
    });
    await sendPush({
      to: loser.expo_push_token,
      title: 'YOU LOST',
      body: pick.text,
      data: { screen: 'round_over', round_id: round.id },
    });
    await writeLastIndex(admin, loser.id, 'round_lost', pick.index);
  }
}

async function readLastIndex(
  admin: SupabaseClient,
  playerId: string,
  triggerType: string
): Promise<number | null> {
  const { data } = await admin
    .from('push_state')
    .select('last_variant_index')
    .eq('player_id', playerId)
    .eq('trigger_type', triggerType)
    .maybeSingle();
  return (data?.last_variant_index ?? null) as number | null;
}

async function writeLastIndex(
  admin: SupabaseClient,
  playerId: string,
  triggerType: string,
  index: number
): Promise<void> {
  await admin
    .from('push_state')
    .upsert(
      {
        player_id: playerId,
        trigger_type: triggerType,
        last_variant_index: index,
        last_fired_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,trigger_type' }
    );
}
