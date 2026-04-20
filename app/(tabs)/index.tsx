import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ACCENT_HEX, CLASS_META } from '@/lib/characters';
import { Stage } from '@/components/game/Stage';
import { FighterCard } from '@/components/game/FighterCard';
import { RedDotBadge } from '@/components/game/RedDotBadge';
import { VsDivider } from '@/components/game/VsDivider';
import { StrikeDrawer } from '@/components/game/StrikeDrawer';
import { StrikeProjectile } from '@/components/game/StrikeProjectile';
import { DebtModal } from '@/components/game/DebtModal';
import { AmnestyConfirmModal } from '@/components/game/AmnestyConfirmModal';
import { formatCountdown } from '@/lib/round';
import { useRoundView } from '@/lib/useRoundView';
import { useStrikeSelect } from '@/lib/useStrikeSelect';
import { useDebtState } from '@/lib/useDebtState';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { markTributePaid } from '@/lib/tribute';
import { getSpendableCoins } from '@/lib/wallet';
import { WORLD_META } from '@/lib/worlds';
import type { Activity, Round, ShopItem } from '@/lib/types';

function PillButton({
  icon,
  label,
  subtitle,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: '#000000',
            borderWidth: 2,
            borderColor: color,
            paddingHorizontal: 10,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          }}
        >
          <Text style={{ fontSize: 14 }}>{icon}</Text>
          <View>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color,
                fontSize: 9,
                letterSpacing: 2,
              }}
            >
              {label}
            </Text>
            {subtitle && (
              <Text
                style={{
                  fontFamily: 'Silkscreen',
                  color: '#FFFFFF',
                  opacity: 0.65,
                  fontSize: 8,
                  marginTop: 2,
                  letterSpacing: 1,
                }}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

function InviteBanner({ code }: { code: string }) {
  return (
    <View
      style={{
        marginTop: 10,
        backgroundColor: '#000000',
        borderWidth: 3,
        borderColor: '#FFCC00',
        padding: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <Text
          style={{ fontFamily: 'PressStart2P', color: '#FFCC00', fontSize: 9 }}
        >
          ◆ WAITING FOR P2 ◆
        </Text>
        <MotiView
          from={{ opacity: 0.2 }}
          animate={{ opacity: 1 }}
          transition={{
            type: 'timing',
            duration: 500,
            loop: true,
            repeatReverse: true,
          }}
        >
          <Text
            style={{ fontFamily: 'PressStart2P', color: '#FF3333', fontSize: 9 }}
          >
            ● LIVE
          </Text>
        </MotiView>
      </View>
      <MotiView
        from={{ opacity: 0.55 }}
        animate={{ opacity: 1 }}
        transition={{
          type: 'timing',
          duration: 700,
          loop: true,
          repeatReverse: true,
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 26,
            textAlign: 'center',
            letterSpacing: 10,
            paddingVertical: 6,
          }}
        >
          {code}
        </Text>
      </MotiView>
      <Text
        style={{
          fontFamily: 'Silkscreen',
          color: '#4A4A4A',
          fontSize: 10,
          textAlign: 'center',
        }}
      >
        SHARE THIS CODE · OR SUMMON STUB IN MORE
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const player = useSession((s) => s.player);
  const couple = useSession((s) => s.couple);
  const view = useRoundView(couple);
  const { state: debtState, refetch: refetchDebt } = useDebtState(
    player?.id ?? null,
    couple?.id ?? null
  );
  const strike = useStrikeSelect(player, couple, debtState.debtMultiplier);

  const { p1, p2, stats, round, countdownSeconds, lastEvent } = view;

  // Partner resolves as whichever of p1/p2 isn't the current player.
  const partnerPlayer =
    p1 && player && p1.id === player.id ? p2 : p1 && p2 && p2.id === player?.id ? p1 : null;
  const { state: partnerDebtState } = useDebtState(
    partnerPlayer?.id ?? null,
    couple?.id ?? null
  );

  // Debt/amnesty modal state.
  const [modalFor, setModalFor] = useState<'me' | 'partner' | null>(null);
  const [amnestyFor, setAmnestyFor] = useState<{
    purchaseId: string;
    itemName: string;
    itemCost: number;
  } | null>(null);
  const [spendable, setSpendable] = useState(0);

  useEffect(() => {
    if (!player?.id) return;
    void getSpendableCoins(player.id).then(setSpendable);
  }, [player?.id, debtState]);

  // Most recent closed round that's unresolved on the current player's side:
  // either the winner hasn't picked yet, the winner hasn't collected yet, or
  // the loser still owes. Drives the home-screen Control Panel CTA + the
  // loser-anchored ball-and-chain indicator.
  const [pendingRound, setPendingRound] = useState<Round | null>(null);
  const [pendingItem, setPendingItem] = useState<ShopItem | null>(null);

  useEffect(() => {
    if (!couple || !player) return;
    let cancelled = false;
    (async () => {
      const { data: rounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('status', 'closed')
        .is('tribute_paid_at', null)
        .not('winner_id', 'is', null)
        .order('number', { ascending: false })
        .limit(1);
      const r = (rounds?.[0] ?? null) as Round | null;
      if (cancelled) return;
      setPendingRound(r);
      if (r?.tribute_shop_item_id) {
        const { data: item } = await supabase
          .from('shop_items')
          .select('*')
          .eq('id', r.tribute_shop_item_id)
          .single<ShopItem>();
        if (!cancelled) setPendingItem(item ?? null);
      } else {
        setPendingItem(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [couple?.id, player?.id]);

  // Count of shop purchases where the partner has called in a redemption and
  // is waiting on me. Drives the red-dot badge on the SHOP ActionTile.
  const [shopQueueCount, setShopQueueCount] = useState<number>(0);

  useEffect(() => {
    if (!player?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('purchases')
        .select('id')
        .eq('target_id', player.id)
        .eq('status', 'redemption_requested');
      if (!cancelled) setShopQueueCount((data ?? []).length);
    })();
    return () => {
      cancelled = true;
    };
  }, [player?.id, pendingRound?.id]);

  // Derived state used by the render below. The CTA in the Control Panel
  // changes label + color based on role / stage:
  //   - winner, unpicked  → "CLAIM TRIBUTE"
  //   - winner, unpaid    → "COLLECT TRIBUTE"
  //   - loser,  unpaid    → "VIEW DEBT"
  const imWinner = pendingRound?.winner_id === player?.id;
  const needsPick = !!pendingRound && imWinner && !pendingRound.tribute_shop_item_id;
  const needsCollect =
    !!pendingRound && imWinner && !!pendingRound.tribute_shop_item_id;
  const isLoserDebt =
    !!pendingRound &&
    pendingRound.winner_id != null &&
    pendingRound.winner_id !== player?.id &&
    !!pendingRound.tribute_shop_item_id;

  // Single source of truth for the on-Stage debt indicator. Loser-only, and
  // only once the winner has picked a tribute item. Viewer-variant: if I'm
  // the winner, the loser's chain labels as 'collects' (yellow YOU GET);
  // otherwise 'owes' (red YOU OWE — I'm the loser).
  const debtForLoser =
    pendingRound && pendingItem && pendingRound.loser_id != null
      ? {
          variant:
            pendingRound.winner_id === player?.id
              ? ('collects' as const)
              : ('owes' as const),
          itemName: pendingItem.name
            .replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '')
            .trim(),
        }
      : null;

  const p1Accent = p1 ? ACCENT_HEX[CLASS_META[p1.arcade_class].accent] : '#FFCC00';
  const p2Accent = p2 ? ACCENT_HEX[CLASS_META[p2.arcade_class].accent] : '#FF3333';

  // Attack animation keys — increment when a log INSERT arrives for that side.
  const [attackKeyP1, setAttackKeyP1] = useState(0);
  const [attackKeyP2, setAttackKeyP2] = useState(0);
  const [lastDeltaP1, setLastDeltaP1] = useState<number | null>(null);
  const [lastDeltaP2, setLastDeltaP2] = useState<number | null>(null);
  const seenEventId = useRef<string | null>(null);

  // Drawer flash map (per-activity bump) and projectile burst state.
  const [strikeFlashMap, setStrikeFlashMap] = useState<Record<string, number>>(
    {}
  );
  const [projectile, setProjectile] = useState<{
    key: number;
    coins: number;
    accent: string;
    side: 'left' | 'right' | 'center';
  } | null>(null);
  const [firstStrikeBanner, setFirstStrikeBanner] = useState<{
    key: number;
    name: string;
    accent: string;
  } | null>(null);
  const projectileKeyRef = useRef(0);
  const firstStrikeKeyRef = useRef(0);

  async function handleStrike(activity: Activity) {
    if (!player || !strike.roundId) return;
    const usedBefore = strike.todayCounts[activity.id] ?? 0;
    const cap = activity.daily_cap ?? 0;
    if (usedBefore >= cap) return;

    // Fire haptic immediately for tactile response, before the network call.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const row = await strike.strike(activity);
    if (!row) return;

    // Optimistically fold the log into the scoreboard so it jumps immediately.
    // If realtime later echoes this row, applyLog dedupes by row.id.
    view.applyLog(row);

    // Bump drawer flash so MoveCard animates
    setStrikeFlashMap((prev) => ({
      ...prev,
      [activity.id]: (prev[activity.id] ?? 0) + 1,
    }));

    // Fire screen-flash + coin projectile
    const accent = WORLD_META[activity.world].accentHex;
    const side: 'left' | 'right' | 'center' =
      p1 && player.id === p1.id
        ? 'left'
        : p2 && player.id === p2.id
          ? 'right'
          : 'center';
    projectileKeyRef.current += 1;
    setProjectile({
      key: projectileKeyRef.current,
      coins: row.coins_earned ?? 0,
      accent,
      side,
    });

    // First-strike-of-day banner
    if (usedBefore === 0) {
      firstStrikeKeyRef.current += 1;
      setFirstStrikeBanner({
        key: firstStrikeKeyRef.current,
        name: activity.name.toUpperCase(),
        accent,
      });
      setTimeout(() => {
        setFirstStrikeBanner((curr) =>
          curr?.key === firstStrikeKeyRef.current ? null : curr
        );
      }, 1500);
    }

  }

  useEffect(() => {
    if (!lastEvent || lastEvent.id === seenEventId.current) return;
    seenEventId.current = lastEvent.id;
    if (p1 && lastEvent.playerId === p1.id) {
      setAttackKeyP1((k) => k + 1);
      setLastDeltaP1(lastEvent.coinsEarned);
    } else if (p2 && lastEvent.playerId === p2.id) {
      setAttackKeyP2((k) => k + 1);
      setLastDeltaP2(lastEvent.coinsEarned);
    }
  }, [lastEvent, p1, p2]);

  // Refresh when the screen regains focus so returning from modals (character
  // select, menu, shop, etc.) pulls fresh p1/p2/stats. Skip the initial focus —
  // useRoundView already fetches on mount. Do NOT refresh useStrikeSelect:
  // counts are authoritatively tracked via optimistic bumps, and re-querying
  // can reset ammo due to the loadTodayCounts TZ-window edge case.
  //
  // Capture refresh via ref so the focus callback has stable identity.
  // useRoundView returns a fresh object every render — depending on `view`
  // here would re-register the focus listener each render, and since the
  // screen is already focused useFocusEffect would re-fire the callback
  // immediately, clobbering optimistic stats with a DB refetch after every
  // strike. Ref + [] deps = callback runs only on real focus transitions.
  const refreshRef = useRef(view.refresh);
  refreshRef.current = view.refresh;
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void refreshRef.current();
    }, [])
  );

  const { openDrawer } = useLocalSearchParams<{ openDrawer?: string }>();
  const localRouter = useRouter();
  const [drawerSignal, setDrawerSignal] = useState(0);

  useEffect(() => {
    if (openDrawer === '1') {
      setDrawerSignal((n) => n + 1);
      // Clear the query so navigating away and back doesn't re-fire.
      localRouter.setParams({ openDrawer: undefined });
    }
  }, [openDrawer]);

  const margin = stats?.margin ?? 0;
  const leader = stats?.leader ?? 'tied';
  const roundNumber = round?.number ?? 1;
  const countdownLabel = formatCountdown(countdownSeconds);

  const p1Score = stats?.p1.score ?? 0;
  const p2Score = stats?.p2?.score ?? 0;
  const maxScoreHint = Math.max(100, p1Score, p2Score) + 50;

  const stageAccent =
    leader === 'p1' ? p1Accent : leader === 'p2' ? p2Accent : '#FFFFFF';

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}>
        {/* ============ TOP BAR (shop / menu) ============ */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 4,
            marginBottom: 6,
          }}
        >
          <View style={{ position: 'relative' }}>
            <PillButton
              icon="💰"
              label="SHOP"
              color="#FFCC00"
              onPress={() => router.push('/(tabs)/shop')}
            />
            {shopQueueCount > 0 && <RedDotBadge />}
          </View>
          <Pressable onPress={() => router.push('/(tabs)/menu')}>
            {({ pressed }) => (
              <View
                style={{
                  backgroundColor: '#000000',
                  borderWidth: 2,
                  borderColor: '#FFCC00',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  opacity: pressed ? 0.7 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: '#FFCC00',
                    fontSize: 11,
                    letterSpacing: 2,
                  }}
                >
                  ≡
                </Text>
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: '#FFCC00',
                    fontSize: 9,
                    letterSpacing: 2,
                  }}
                >
                  MENU
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* ============ VS ARENA ============ */}
        <View>
          <Stage
            accentHex={stageAccent}
            height={520}
            style={{
              borderWidth: 0,
              borderBottomWidth: 3,
              borderBottomColor: stageAccent,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                paddingTop: 10,
              }}
            >
              <View style={{ flex: 5, justifyContent: 'flex-end' }}>
                {/* P1 fighter wrapper — FighterCard handles debt indicator internally. */}
                <View style={{ flex: 1, position: 'relative' }}>
                  <FighterCard
                    player={p1}
                    score={p1Score}
                    side="left"
                    isLeader={leader === 'p1' && p2 != null}
                    attackKey={attackKeyP1}
                    lastDelta={lastDeltaP1}
                    maxScoreHint={maxScoreHint}
                    coins={p1?.personal_wallet}
                    debt={
                      p1 && debtForLoser && pendingRound?.loser_id === p1.id
                        ? debtForLoser
                        : null
                    }
                    inDebt={
                      p1 && player && p1.id === player.id
                        ? debtState.inDebt
                        : p1 && partnerPlayer && p1.id === partnerPlayer.id
                          ? partnerDebtState.inDebt
                          : false
                    }
                    onDebtPress={
                      p1 && player && p1.id === player.id
                        ? () => setModalFor('me')
                        : () => setModalFor('partner')
                    }
                  />
                </View>
              </View>
              <View style={{ flex: 3, justifyContent: 'center' }}>
                <VsDivider
                  margin={margin}
                  leader={leader}
                  countdownLabel={countdownLabel}
                  roundNumber={roundNumber}
                />
              </View>
              <View style={{ flex: 5, justifyContent: 'flex-end' }}>
                {/* P2 fighter wrapper — FighterCard handles debt indicator internally. */}
                <View style={{ flex: 1, position: 'relative' }}>
                  <FighterCard
                    player={p2}
                    score={p2Score}
                    side="right"
                    isLeader={leader === 'p2'}
                    attackKey={attackKeyP2}
                    lastDelta={lastDeltaP2}
                    maxScoreHint={maxScoreHint}
                    coins={p2?.personal_wallet}
                    debt={
                      p2 && debtForLoser && pendingRound?.loser_id === p2.id
                        ? debtForLoser
                        : null
                    }
                    inDebt={
                      p2 && player && p2.id === player.id
                        ? debtState.inDebt
                        : p2 && partnerPlayer && p2.id === partnerPlayer.id
                          ? partnerDebtState.inDebt
                          : false
                    }
                    onDebtPress={
                      p2 && player && p2.id === player.id
                        ? () => setModalFor('me')
                        : () => setModalFor('partner')
                    }
                  />
                </View>
              </View>
            </View>

            {/* ============ CONTEXTUAL OVERLAY (bottom-center, round-close CTA) ============ */}
            {needsPick && pendingRound && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                }}
              >
                <PillButton
                  icon="🎁"
                  label="CLAIM"
                  subtitle="TRIBUTE"
                  color="#9EFA00"
                  onPress={() =>
                    router.push({
                      pathname: '/(round)/over',
                      params: { roundId: pendingRound.id },
                    })
                  }
                />
              </View>
            )}
            {needsCollect && pendingRound && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                }}
              >
                <PillButton
                  icon="👑"
                  label="COLLECT"
                  subtitle={pendingItem?.name?.slice(0, 14)?.toUpperCase() ?? 'TRIBUTE'}
                  color="#FFCC00"
                  onPress={() =>
                    router.push({
                      pathname: '/(round)/over',
                      params: { roundId: pendingRound.id },
                    })
                  }
                />
              </View>
            )}
            {isLoserDebt && pendingRound && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                }}
              >
                <PillButton
                  icon="💀"
                  label="OWED"
                  subtitle={pendingItem?.name?.slice(0, 14)?.toUpperCase()}
                  color="#FF3333"
                  onPress={() =>
                    router.push({
                      pathname: '/(round)/over',
                      params: { roundId: pendingRound.id },
                    })
                  }
                />
              </View>
            )}
          </Stage>
        </View>

        {/* ============ STRIKE DRAWER (arsenal) ============ */}
        <StrikeDrawer
          activities={strike.activities}
          todayCounts={strike.todayCounts}
          loading={strike.loading}
          roundActive={strike.roundId != null}
          onStrike={(a) => void handleStrike(a)}
          strikeFlashMap={strikeFlashMap}
          openSignal={drawerSignal}
          debtMultiplier={debtState.debtMultiplier}
        />

        {/* ============ INVITE CODE (only when no P2) ============ */}
        {!p2 && <InviteBanner code={couple?.invite_code ?? '------'} />}
      </ScrollView>

      {/* ============ STRIKE EFFECTS OVERLAY ============ */}
      <StrikeProjectile burst={projectile} />

      <DebtModal
        visible={modalFor !== null}
        onClose={() => setModalFor(null)}
        debt={modalFor === 'partner' ? partnerDebtState : debtState}
        viewerIsDebtor={modalFor === 'me'}
        onPay={async (src) => {
          if (src.kind === 'tribute') {
            await markTributePaid(src.round_id);
            void refetchDebt();
          }
          // Purchase redeems are handled via the shop queue; v1 punts on
          // deep-linking and just closes the modal.
          setModalFor(null);
        }}
        onAmnesty={async (src) => {
          const { data } = await supabase
            .from('shop_items')
            .select('name, cost')
            .eq('id', src.shop_item_id)
            .single();
          if (!data) return;
          setAmnestyFor({
            purchaseId: src.purchase_id,
            itemName: data.name,
            itemCost: data.cost,
          });
          setModalFor(null);
        }}
      />
      <AmnestyConfirmModal
        visible={amnestyFor !== null}
        purchaseId={amnestyFor?.purchaseId ?? null}
        itemName={amnestyFor?.itemName ?? ''}
        itemCost={amnestyFor?.itemCost ?? 0}
        spendable={spendable}
        onClose={() => setAmnestyFor(null)}
        onResolved={() => {
          void refetchDebt();
          if (player) void getSpendableCoins(player.id).then(setSpendable);
        }}
      />

      {/* First-strike-of-day banner */}
      {firstStrikeBanner && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1001,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MotiView
            key={`fs-${firstStrikeBanner.key}`}
            from={{ translateY: 30, opacity: 0, scale: 0.6 }}
            animate={{ translateY: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 300 }}
          >
            <View
              style={{
                backgroundColor: '#000000',
                borderWidth: 3,
                borderColor: firstStrikeBanner.accent,
                paddingHorizontal: 16,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: firstStrikeBanner.accent,
                  fontSize: 10,
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                ★ FIRST STRIKE ★
              </Text>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#FFFFFF',
                  fontSize: 12,
                }}
              >
                {firstStrikeBanner.name}
              </Text>
            </View>
          </MotiView>
        </View>
      )}
    </SafeAreaView>
  );
}
