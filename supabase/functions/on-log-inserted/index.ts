// =============================================================================
// Fires push notifications in response to log inserts and round-status flips.
// Receives one of four payloads from Postgres triggers (via pg_net):
//   { record: LogRow }                      — event-driven triggers on strike
//   { type: 'round_closed', round: ... }    — round close transition
//   { type: 'tribute_picked', round: ... }  — winner picked tribute (push to loser)
//   { type: 'tribute_paid', round: ... }    — winner confirmed received (closure beat)
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
  round_value_earned: number;
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
  loser_id: string | null;
  p1_total: number | null;
  p2_total: number | null;
  margin: number | null;
  tribute_shop_item_id: string | null;
  tribute_paid_at: string | null;
};

type LogInsertPayload = { record: LogRow };
type RoundClosedPayload = { type: 'round_closed'; round: RoundRow };
type TributePickedPayload = { type: 'tribute_picked'; round: RoundRow };
type TributePaidPayload = { type: 'tribute_paid'; round: RoundRow };
type PurchaseRow = {
  id: string;
  shop_item_id: string;
  buyer_id: string;
  target_id: string;
  purchased_at: string;
  redemption_requested_at: string | null;
  redeemed_at: string | null;
  status: string;
  cancelled_via?: string | null;
};
type PurchaseMadePayload = { type: 'purchase_made'; purchase: PurchaseRow };
type RedemptionRequestedPayload = { type: 'redemption_requested'; purchase: PurchaseRow };
type DeliveryConfirmedPayload = { type: 'delivery_confirmed'; purchase: PurchaseRow };
type PurchaseAmnestyPayload = { type: 'purchase_amnesty'; purchase: PurchaseRow };
type DispatchPayload =
  | LogInsertPayload
  | RoundClosedPayload
  | TributePickedPayload
  | TributePaidPayload
  | PurchaseMadePayload
  | RedemptionRequestedPayload
  | DeliveryConfirmedPayload
  | PurchaseAmnestyPayload;

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

  if ('type' in payload) {
    if (payload.type === 'round_closed') {
      await handleRoundClosed(admin, payload);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'tribute_picked') {
      await handleTributePicked(admin, payload.round);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'tribute_paid') {
      await handleTributePaid(admin, payload.round);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'purchase_made') {
      await handlePurchaseMade(admin, payload.purchase);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'redemption_requested') {
      await handleRedemptionRequested(admin, payload.purchase);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'delivery_confirmed') {
      await handleDeliveryConfirmed(admin, payload.purchase);
      return new Response('ok', { status: 200 });
    }
    if (payload.type === 'purchase_amnesty') {
      await handlePurchaseAmnesty(admin, payload.purchase);
      return new Response('ok', { status: 200 });
    }
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
    .select('player_id, round_value_earned')
    .eq('round_id', log.round_id);

  const strikerTotal = (totals ?? [])
    .filter((r: { player_id: string }) => r.player_id === striker.id)
    .reduce((s: number, r: { round_value_earned: number | null }) => s + (r.round_value_earned ?? 0), 0);
  const partnerTotal = (totals ?? [])
    .filter((r: { player_id: string }) => r.player_id === partner.id)
    .reduce((s: number, r: { round_value_earned: number | null }) => s + (r.round_value_earned ?? 0), 0);

  // Totals BEFORE this strike landed (log.round_value_earned is already in totals).
  const strikerTotalBefore = strikerTotal - (log.round_value_earned ?? 0);

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

async function handleTributePicked(admin: SupabaseClient, round: RoundRow): Promise<void> {
  if (!round.loser_id || !round.tribute_shop_item_id) return;
  if (isQuietHours()) return;

  const [{ data: loser }, { data: winner }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', round.loser_id)
      .maybeSingle(),
    round.winner_id
      ? admin
          .from('players')
          .select('id, display_name')
          .eq('id', round.winner_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('shop_items')
      .select('name')
      .eq('id', round.tribute_shop_item_id)
      .maybeSingle(),
  ]);

  if (!loser?.expo_push_token) return;

  const lastIndex = await readLastIndex(admin, loser.id, 'tribute_picked');
  const pick = pickVariant(VARIANTS.tribute_picked, lastIndex, {
    partner: winner?.display_name ?? 'partner',
    tribute: item?.name ?? 'a tribute',
  });
  await sendPush({
    to: loser.expo_push_token,
    title: 'TRIBUTE PICKED',
    body: pick.text,
    data: { screen: 'round_over', round_id: round.id },
  });
  await writeLastIndex(admin, loser.id, 'tribute_picked', pick.index);
}

async function handleTributePaid(admin: SupabaseClient, round: RoundRow): Promise<void> {
  if (!round.winner_id || !round.tribute_shop_item_id) return;
  if (isQuietHours()) return;

  const [{ data: winner }, { data: loser }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', round.winner_id)
      .maybeSingle(),
    round.loser_id
      ? admin
          .from('players')
          .select('id, display_name, expo_push_token')
          .eq('id', round.loser_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('shop_items')
      .select('name')
      .eq('id', round.tribute_shop_item_id)
      .maybeSingle(),
  ]);

  // The tribute_paid push goes to the LOSER as a closure beat
  // ("you're square"). Winner already saw the haptic in-app on collect.
  if (!loser?.expo_push_token && !winner?.expo_push_token) return;
  const target = loser?.expo_push_token ? loser : winner;
  if (!target?.expo_push_token) return;
  const partnerName =
    target.id === loser?.id ? winner?.display_name ?? 'partner' : loser?.display_name ?? 'partner';

  const lastIndex = await readLastIndex(admin, target.id, 'tribute_paid');
  const pick = pickVariant(VARIANTS.tribute_paid, lastIndex, {
    partner: partnerName,
    tribute: item?.name ?? 'tribute',
  });
  await sendPush({
    to: target.expo_push_token,
    title: 'TRIBUTE PAID',
    body: pick.text,
    data: { screen: 'home' },
  });
  await writeLastIndex(admin, target.id, 'tribute_paid', pick.index);
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

async function handlePurchaseMade(
  admin: SupabaseClient,
  purchase: PurchaseRow
): Promise<void> {
  if (!purchase.target_id || isQuietHours()) return;
  const [{ data: target }, { data: buyer }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', purchase.target_id)
      .maybeSingle(),
    admin
      .from('players')
      .select('id, display_name')
      .eq('id', purchase.buyer_id)
      .maybeSingle(),
    admin
      .from('shop_items')
      .select('name')
      .eq('id', purchase.shop_item_id)
      .maybeSingle(),
  ]);
  if (!target?.expo_push_token) return;

  const lastIndex = await readLastIndex(admin, target.id, 'purchase_made');
  const pick = pickVariant(VARIANTS.purchase_made, lastIndex, {
    partner: buyer?.display_name ?? 'partner',
    item: item?.name ?? 'an item',
  });
  await sendPush({
    to: target.expo_push_token,
    title: 'NEW PURCHASE',
    body: pick.text,
    data: { screen: 'shop' },
  });
  await writeLastIndex(admin, target.id, 'purchase_made', pick.index);
}

async function handleRedemptionRequested(
  admin: SupabaseClient,
  purchase: PurchaseRow
): Promise<void> {
  if (!purchase.target_id || isQuietHours()) return;
  const [{ data: target }, { data: buyer }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', purchase.target_id)
      .maybeSingle(),
    admin
      .from('players')
      .select('id, display_name')
      .eq('id', purchase.buyer_id)
      .maybeSingle(),
    admin
      .from('shop_items')
      .select('name')
      .eq('id', purchase.shop_item_id)
      .maybeSingle(),
  ]);
  if (!target?.expo_push_token) return;

  const lastIndex = await readLastIndex(admin, target.id, 'redemption_requested');
  const pick = pickVariant(VARIANTS.redemption_requested, lastIndex, {
    partner: buyer?.display_name ?? 'partner',
    item: item?.name ?? 'tribute',
  });
  await sendPush({
    to: target.expo_push_token,
    title: 'REDEMPTION NOW',
    body: pick.text,
    data: { screen: 'shop' },
  });
  await writeLastIndex(admin, target.id, 'redemption_requested', pick.index);
}

async function handleDeliveryConfirmed(
  admin: SupabaseClient,
  purchase: PurchaseRow
): Promise<void> {
  if (!purchase.buyer_id || isQuietHours()) return;
  const [{ data: buyer }, { data: target }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', purchase.buyer_id)
      .maybeSingle(),
    admin
      .from('players')
      .select('id, display_name')
      .eq('id', purchase.target_id)
      .maybeSingle(),
    admin
      .from('shop_items')
      .select('name')
      .eq('id', purchase.shop_item_id)
      .maybeSingle(),
  ]);
  if (!buyer?.expo_push_token) return;

  const lastIndex = await readLastIndex(admin, buyer.id, 'delivery_confirmed');
  const pick = pickVariant(VARIANTS.delivery_confirmed, lastIndex, {
    partner: target?.display_name ?? 'partner',
    item: item?.name ?? 'tribute',
  });
  await sendPush({
    to: buyer.expo_push_token,
    title: 'DELIVERED',
    body: pick.text,
    data: { screen: 'home' },
  });
  await writeLastIndex(admin, buyer.id, 'delivery_confirmed', pick.index);
}

async function handlePurchaseAmnesty(
  admin: SupabaseClient,
  purchase: PurchaseRow
): Promise<void> {
  // Buyer gets the push — they're being refunded because the target paid
  // amnesty (1.5x fee) to cancel the purchase. The "partner" in the
  // notification text is the target (the one who paid amnesty).
  if (!purchase.buyer_id || isQuietHours()) return;
  const [{ data: buyer }, { data: target }, { data: item }] = await Promise.all([
    admin
      .from('players')
      .select('id, display_name, expo_push_token')
      .eq('id', purchase.buyer_id)
      .maybeSingle(),
    admin
      .from('players')
      .select('id, display_name')
      .eq('id', purchase.target_id)
      .maybeSingle(),
    admin
      .from('shop_items')
      .select('name, cost')
      .eq('id', purchase.shop_item_id)
      .maybeSingle(),
  ]);
  if (!buyer?.expo_push_token) return;

  const lastIndex = await readLastIndex(admin, buyer.id, 'purchase_amnesty');
  const pick = pickVariant(VARIANTS.purchase_amnesty, lastIndex, {
    partner: target?.display_name ?? 'partner',
    item: item?.name ?? 'an item',
    refund: item?.cost ?? 0,
  });
  await sendPush({
    to: buyer.expo_push_token,
    title: 'PURCHASE CANCELLED',
    body: pick.text,
    data: { screen: 'shop' },
  });
  await writeLastIndex(admin, buyer.id, 'purchase_amnesty', pick.index);
}
