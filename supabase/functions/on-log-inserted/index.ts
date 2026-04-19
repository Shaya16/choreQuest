// =============================================================================
// Fires push notifications in response to log inserts and round-status flips.
// Receives one of two payloads from Postgres triggers (via pg_net):
//   { record: LogRow }                    — event-driven triggers on strike
//   { type: 'round_closed', round: ... }  — round close transition
// =============================================================================
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { VARIANTS, TriggerType } from '../_shared/variants.ts';
import { pickVariant } from '../_shared/variant-picker.ts';
import { isQuietHours } from '../_shared/quiet-hours.ts';
import { sendPush } from '../_shared/expo-push.ts';

type LogRow = {
  id: string;
  player_id: string;
  activity_id: string;
  round_id: string;
  coins_earned: number;
  logged_at: string;
};

type RoundRow = {
  id: string;
  couple_id: string;
  number: number;
  start_date: string;
  end_date: string;
  status: string;
  winner_id: string | null;
  p1_total: number | null;
  p2_total: number | null;
  margin: number | null;
};

type LogInsertPayload = { record: LogRow };
type RoundClosedPayload = { type: 'round_closed'; round: RoundRow };
type DispatchPayload = LogInsertPayload | RoundClosedPayload;

type TargetPlayer = {
  id: string;
  expo_push_token: string | null;
};

const MILESTONE_LEVELS = [100, 250, 500, 1000];
const COOLDOWN_MS = 30 * 60 * 1000;

Deno.serve(async (req: Request) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let payload: DispatchPayload;
  try {
    payload = (await req.json()) as DispatchPayload;
  } catch (e) {
    return new Response('invalid json', { status: 400 });
  }

  if ('type' in payload && payload.type === 'round_closed') {
    await handleRoundClosed(admin, payload);
    return new Response('ok', { status: 200 });
  }

  const log = (payload as LogInsertPayload).record;
  if (!log) return new Response('no record', { status: 400 });

  await handleLogInserted(admin, log);
  return new Response('ok', { status: 200 });
});

async function handleLogInserted(admin: SupabaseClient, log: LogRow) {
  // Load striker, partner, round, and both players' totals.
  const { data: striker } = await admin
    .from('players')
    .select('*')
    .eq('id', log.player_id)
    .single();
  if (!striker?.couple_id) return;

  const { data: partner } = await admin
    .from('players')
    .select('*')
    .eq('couple_id', striker.couple_id)
    .neq('id', striker.id)
    .maybeSingle();
  if (!partner) return;

  const { data: round } = await admin
    .from('rounds')
    .select('*')
    .eq('id', log.round_id)
    .single();
  if (!round) return;

  const { data: totals } = await admin
    .from('logs')
    .select('player_id, coins_earned')
    .eq('round_id', log.round_id);

  const strikerTotal = (totals ?? [])
    .filter((r: { player_id: string }) => r.player_id === striker.id)
    .reduce((s: number, r: { coins_earned: number | null }) => s + (r.coins_earned ?? 0), 0);
  const partnerTotal = (totals ?? [])
    .filter((r: { player_id: string }) => r.player_id === partner.id)
    .reduce((s: number, r: { coins_earned: number | null }) => s + (r.coins_earned ?? 0), 0);

  // Totals BEFORE this strike landed (log.coins_earned is already in totals).
  const strikerTotalBefore = strikerTotal - (log.coins_earned ?? 0);

  // --- Trigger: lead flip ---
  const wasBehindOrTied = strikerTotalBefore <= partnerTotal;
  const isAhead = strikerTotal > partnerTotal;
  if (wasBehindOrTied && isAhead) {
    await fireWithCooldown(admin, partner, 'lead_flip', {
      partner: striker.display_name.toLowerCase(),
      gap: strikerTotal - partnerTotal,
    });
  }

  // --- Trigger: milestone ---
  for (const level of MILESTONE_LEVELS) {
    if (strikerTotalBefore < level && strikerTotal >= level) {
      await fireMilestone(admin, partner, level, log.round_id, {
        partner: striker.display_name.toLowerCase(),
        n: level,
        y: partnerTotal,
      });
    }
  }

  // --- Trigger: round ending soon ---
  const now = new Date();
  const endMs = new Date(round.end_date).getTime();
  const hoursLeft = Math.floor((endMs - now.getTime()) / (60 * 60 * 1000));
  const partnerBehind = strikerTotal - partnerTotal;
  if (hoursLeft > 0 && hoursLeft < 24 && partnerBehind >= 50) {
    await fireOncePerRound(admin, partner, 'round_ending', log.round_id, {
      hours: hoursLeft,
      gap: partnerBehind,
    });
  }
}

async function handleRoundClosed(admin: SupabaseClient, payload: RoundClosedPayload) {
  const { round } = payload;
  if (!round.winner_id) return;

  const { data: winner } = await admin
    .from('players')
    .select('*')
    .eq('id', round.winner_id)
    .single();
  if (!winner) return;

  const { data: loser } = await admin
    .from('players')
    .select('*')
    .eq('couple_id', round.couple_id)
    .neq('id', round.winner_id)
    .maybeSingle();
  if (!loser) return;

  await fireOncePerRound(admin, loser, 'round_closed', round.id, {
    partner: winner.display_name.toLowerCase(),
    n: round.number,
    next: round.number + 1,
    margin: round.margin ?? 0,
  });
}

async function loadPushState(
  admin: SupabaseClient,
  playerId: string,
  trigger: TriggerType
) {
  const { data } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', playerId)
    .eq('trigger_type', trigger)
    .maybeSingle();
  return data;
}

function cooldownElapsed(lastFiredAt: string | null | undefined): boolean {
  if (!lastFiredAt) return true;
  return Date.now() - new Date(lastFiredAt).getTime() >= COOLDOWN_MS;
}

async function deliverPush(
  admin: SupabaseClient,
  target: TargetPlayer,
  trigger: TriggerType,
  text: string,
  index: number,
  dedupExtras: { round_id?: string; level?: number; date?: string } = {}
) {
  if (!target.expo_push_token) return;
  const result = await sendPush({
    to: target.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });
  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: target.id,
      trigger_type: trigger,
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
      dedup_round_id: dedupExtras.round_id ?? null,
      dedup_level: dedupExtras.level ?? null,
      dedup_date: dedupExtras.date ?? null,
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', target.id);
  }
}

async function fireWithCooldown(
  admin: SupabaseClient,
  target: TargetPlayer,
  trigger: TriggerType,
  vars: Record<string, string | number>
) {
  if (!target.expo_push_token) return;
  if (isQuietHours()) return;

  const state = await loadPushState(admin, target.id, trigger);
  if (!cooldownElapsed(state?.last_fired_at)) return;

  const { text, index } = pickVariant(
    VARIANTS[trigger],
    state?.last_variant_index ?? null,
    vars
  );
  await deliverPush(admin, target, trigger, text, index);
}

async function fireMilestone(
  admin: SupabaseClient,
  target: TargetPlayer,
  level: number,
  roundId: string,
  vars: Record<string, string | number>
) {
  if (!target.expo_push_token) return;
  if (isQuietHours()) return;

  const state = await loadPushState(admin, target.id, 'milestone');
  // Per (player, round, level) dedup: never same level twice in a round.
  if (state?.dedup_round_id === roundId && (state?.dedup_level ?? 0) >= level) return;
  if (!cooldownElapsed(state?.last_fired_at)) return;

  const { text, index } = pickVariant(
    VARIANTS.milestone,
    state?.last_variant_index ?? null,
    vars
  );
  await deliverPush(admin, target, 'milestone', text, index, {
    round_id: roundId,
    level,
  });
}

async function fireOncePerRound(
  admin: SupabaseClient,
  target: TargetPlayer,
  trigger: Extract<TriggerType, 'round_ending' | 'round_closed'>,
  roundId: string,
  vars: Record<string, string | number>
) {
  if (!target.expo_push_token) return;
  if (isQuietHours()) return;

  const state = await loadPushState(admin, target.id, trigger);
  if (state?.dedup_round_id === roundId) return;
  if (!cooldownElapsed(state?.last_fired_at)) return;

  const { text, index } = pickVariant(
    VARIANTS[trigger],
    state?.last_variant_index ?? null,
    vars
  );
  await deliverPush(admin, target, trigger, text, index, { round_id: roundId });
}
