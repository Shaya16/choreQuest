import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ACCENT_HEX, CLASS_META } from '@/lib/characters';
import { Stage } from '@/components/game/Stage';
import { FighterCard } from '@/components/game/FighterCard';
import { DebtBadge } from '@/components/game/DebtBadge';
import { RedDotBadge } from '@/components/game/RedDotBadge';
import { VsDivider } from '@/components/game/VsDivider';
import { StrikeDrawer } from '@/components/game/StrikeDrawer';
import { StrikeProjectile } from '@/components/game/StrikeProjectile';
import { formatCountdown } from '@/lib/round';
import { useRoundView } from '@/lib/useRoundView';
import { useStrikeSelect } from '@/lib/useStrikeSelect';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { WORLD_META } from '@/lib/worlds';
import type { Activity, Round, ShopItem } from '@/lib/types';

function ActionTile({
  icon,
  label,
  subtitle,
  color,
  onPress,
  bounceDelay = 0,
  lampDelay = 0,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  color: string;
  onPress: () => void;
  bounceDelay?: number;
  lampDelay?: number;
}) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <View style={{ position: 'relative' }}>
          {/* Drop shadow — disappears when button is pressed down into it */}
          {!pressed && (
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                right: -4,
                bottom: -4,
                backgroundColor: '#000000',
              }}
            />
          )}

          {/* Button face — shifts into the shadow slot on press */}
          <View
            style={{
              transform: [
                { translateX: pressed ? 4 : 0 },
                { translateY: pressed ? 4 : 0 },
              ],
              backgroundColor: color,
              borderWidth: 3,
              borderColor: '#000000',
              paddingTop: 8,
              paddingBottom: 6,
              paddingHorizontal: 4,
            }}
          >
            {/* Inner bevel — highlight top/left, shadow bottom/right. Inverts on press. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderTopWidth: 2,
                borderLeftWidth: 2,
                borderTopColor: pressed ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)',
                borderLeftColor: pressed ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)',
                borderBottomWidth: 2,
                borderRightWidth: 2,
                borderBottomColor: pressed ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.5)',
                borderRightColor: pressed ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.5)',
              }}
            />

            {/* Corner lamp — blinks */}
            <MotiView
              from={{ opacity: 0.25 }}
              animate={{ opacity: 1 }}
              transition={{
                type: 'timing',
                duration: 600,
                delay: lampDelay,
                loop: true,
                repeatReverse: true,
              }}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 4,
                height: 4,
                backgroundColor: '#FFFFFF',
              }}
            />

            {/* Icon window — recessed inset */}
            <View
              style={{
                alignSelf: 'center',
                width: '90%',
                height: 46,
                backgroundColor: '#000000',
                marginBottom: 6,
                alignItems: 'center',
                justifyContent: 'center',
                borderTopWidth: 2,
                borderLeftWidth: 2,
                borderTopColor: 'rgba(0,0,0,0.85)',
                borderLeftColor: 'rgba(0,0,0,0.85)',
                borderBottomWidth: 2,
                borderRightWidth: 2,
                borderBottomColor: 'rgba(255,255,255,0.12)',
                borderRightColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <MotiView
                from={{ translateY: 0 }}
                animate={{ translateY: -3 }}
                transition={{
                  type: 'timing',
                  duration: 700,
                  delay: bounceDelay,
                  loop: true,
                  repeatReverse: true,
                }}
              >
                <Text style={{ fontSize: 22 }}>{icon}</Text>
              </MotiView>
            </View>

            {/* Label plate */}
            <View
              style={{
                backgroundColor: '#000000',
                paddingVertical: 3,
                paddingHorizontal: 2,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color,
                  fontSize: 9,
                  letterSpacing: 1,
                }}
              >
                {label}
              </Text>
              {subtitle && (
                <Text
                  style={{
                    fontFamily: 'Silkscreen',
                    color: '#FFFFFF',
                    opacity: 0.55,
                    fontSize: 9,
                    marginTop: 1,
                    letterSpacing: 1,
                  }}
                >
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function ControlPanel({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        marginTop: 14,
        backgroundColor: '#0a0a0a',
        borderWidth: 2,
        borderColor: '#4A4A4A',
        paddingHorizontal: 8,
        paddingTop: 0,
        paddingBottom: 10,
      }}
    >
      {/* Panel header strip */}
      <View
        style={{
          marginHorizontal: -8,
          marginBottom: 10,
          backgroundColor: '#4A4A4A',
          paddingVertical: 4,
          paddingHorizontal: 8,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#000000',
            fontSize: 8,
            letterSpacing: 2,
          }}
        >
          ◆ CONTROL PANEL ◆
        </Text>
        <MotiView
          from={{ opacity: 0.3 }}
          animate={{ opacity: 1 }}
          transition={{
            type: 'timing',
            duration: 500,
            loop: true,
            repeatReverse: true,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#9EFA00',
              fontSize: 8,
            }}
          >
            ● READY
          </Text>
        </MotiView>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>
    </View>
  );
}

function DebtBadgeMaybe({
  round,
  item,
  fighterId,
  viewerId,
}: {
  round: Round;
  item: ShopItem;
  fighterId: string;
  viewerId: string;
}) {
  // Show OWES badge over the loser's fighter (always).
  // Show COLLECTS badge over the loser's fighter on the winner's view too —
  // since both badges live on the loser's sprite, just pick variant by viewer.
  if (round.loser_id !== fighterId) return null;

  const variant: 'owes' | 'collects' =
    round.winner_id === viewerId ? 'collects' : 'owes';

  return (
    <DebtBadge
      variant={variant}
      itemIcon={extractIcon(item.name)}
      itemLabel={stripIcon(item.name)}
    />
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
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
  const strike = useStrikeSelect(player, couple);

  const { p1, p2, stats, round, countdownSeconds, lastEvent } = view;

  // Most recent closed round that's unresolved on the current player's side:
  // either the winner hasn't picked yet, the winner hasn't collected yet, or
  // the loser still owes. Drives the home-screen Control Panel CTA + DebtBadge.
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
    pendingRound.winner_id !== player?.id;

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
        {/* ============ TOP BAR (menu) ============ */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            marginTop: 4,
            marginBottom: 6,
          }}
        >
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
            height={420}
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
                {/* P1 fighter wrapper — DebtBadge layers above when applicable.
                    `alignSelf: 'stretch'` is required so FighterCard's flex:1
                    still fills the parent column width. */}
                <View style={{ flex: 1, position: 'relative' }}>
                  <FighterCard
                    player={p1}
                    score={p1Score}
                    side="left"
                    isLeader={leader === 'p1' && p2 != null}
                    attackKey={attackKeyP1}
                    lastDelta={lastDeltaP1}
                    maxScoreHint={maxScoreHint}
                  />
                  {pendingRound && pendingItem && p1 && (
                    <DebtBadgeMaybe
                      round={pendingRound}
                      item={pendingItem}
                      fighterId={p1.id}
                      viewerId={player?.id ?? ''}
                    />
                  )}
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
                {/* P2 fighter wrapper — same layout fix as P1 above. */}
                <View style={{ flex: 1, position: 'relative' }}>
                  <FighterCard
                    player={p2}
                    score={p2Score}
                    side="right"
                    isLeader={leader === 'p2'}
                    attackKey={attackKeyP2}
                    lastDelta={lastDeltaP2}
                    maxScoreHint={maxScoreHint}
                  />
                  {pendingRound && pendingItem && p2 && (
                    <DebtBadgeMaybe
                      round={pendingRound}
                      item={pendingItem}
                      fighterId={p2.id}
                      viewerId={player?.id ?? ''}
                    />
                  )}
                </View>
              </View>
            </View>
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
        />

        {/* ============ INVITE CODE (only when no P2) ============ */}
        {!p2 && <InviteBanner code={couple?.invite_code ?? '------'} />}

        {/* ============ CONTROL PANEL ============ */}
        {/* Jackpot button removed — co-op layer hidden per round-close+tribute design.
            jackpot.tsx route stays on disk; re-enabling is restoring the ActionTile. */}
        <ControlPanel>
          <View style={{ position: 'relative' }}>
            <ActionTile
              icon="💰"
              label="SHOP"
              subtitle="REDEEM"
              color="#FFCC00"
              bounceDelay={0}
              lampDelay={0}
              onPress={() => router.push('/(tabs)/shop')}
            />
            {shopQueueCount > 0 && <RedDotBadge />}
          </View>
          {needsPick && pendingRound && (
            <ActionTile
              icon="🎁"
              label="CLAIM"
              subtitle="TRIBUTE"
              color="#9EFA00"
              bounceDelay={120}
              lampDelay={200}
              onPress={() =>
                router.push({
                  pathname: '/(round)/over',
                  params: { roundId: pendingRound.id },
                })
              }
            />
          )}
          {needsCollect && pendingRound && (
            <ActionTile
              icon="👑"
              label="COLLECT"
              subtitle={pendingItem?.name?.slice(0, 14)?.toUpperCase() ?? 'TRIBUTE'}
              color="#FFCC00"
              bounceDelay={120}
              lampDelay={200}
              onPress={() =>
                router.push({
                  pathname: '/(round)/over',
                  params: { roundId: pendingRound.id },
                })
              }
            />
          )}
          {isLoserDebt && pendingRound && (
            <ActionTile
              icon="💀"
              label="OWED"
              subtitle={pendingItem?.name?.slice(0, 14)?.toUpperCase() ?? 'TBD'}
              color="#FF3333"
              bounceDelay={120}
              lampDelay={200}
              onPress={() =>
                router.push({
                  pathname: '/(round)/over',
                  params: { roundId: pendingRound.id },
                })
              }
            />
          )}
        </ControlPanel>
      </ScrollView>

      {/* ============ STRIKE EFFECTS OVERLAY ============ */}
      <StrikeProjectile burst={projectile} />

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
