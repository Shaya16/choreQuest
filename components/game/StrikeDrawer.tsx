import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { MoveCard } from './MoveCard';
import { WORLD_META, WORLD_ORDER } from '@/lib/worlds';
import type { Activity, HouseholdTier, World } from '@/lib/types';

const HOUSEHOLD_TIERS: HouseholdTier[] = ['daily', 'weekly', 'monthly'];

type Props = {
  activities: Record<World, Activity[]>;
  todayCounts: Record<string, number>;
  loading: boolean;
  roundActive: boolean;
  onStrike: (activity: Activity) => void;
  strikeFlashMap: Record<string, number>;
  /** Bumped by the caller to force the drawer open (e.g. from a push tap). */
  openSignal?: number;
};

type DrawerView = 'collapsed' | 'picker' | World;

/**
 * Cabinet-drawer arsenal with a character-select mental model:
 *   picker → 3×2 grid of chunky "world cards" (default view; pick a world)
 *   world  → that world's moves, with a ◀ BACK pill
 *   collapsed → header only; tap to reopen
 *
 * World cards are styled like fighting-game character-select tiles: corner
 * brackets, big emoji, ammo pill, drop-shadow slab that they slide into on
 * press. Household world's tier divisions surface once you're inside it.
 */
export function StrikeDrawer({
  activities,
  todayCounts,
  loading,
  roundActive,
  onStrike,
  strikeFlashMap,
  openSignal,
}: Props) {
  const [view, setView] = useState<DrawerView>('picker');
  const expanded = view !== 'collapsed';

  // External signal to expand the drawer (e.g. notification tap).
  // Skip the initial mount since view already defaults to 'picker'.
  useEffect(() => {
    if (openSignal === undefined) return;
    setView('picker');
  }, [openSignal]);

  const totalAmmo = useMemo(() => {
    let total = 0;
    for (const w of WORLD_ORDER) {
      for (const a of activities[w] ?? []) {
        const used = todayCounts[a.id] ?? 0;
        total += Math.max(0, (a.daily_cap ?? 0) - used);
      }
    }
    return total;
  }, [activities, todayCounts]);

  function toggleHeader() {
    setView((prev) => (prev === 'collapsed' ? 'picker' : 'collapsed'));
  }

  return (
    <View
      style={{
        marginTop: 10,
        backgroundColor: '#000000',
        borderWidth: 3,
        borderColor: '#FFCC00',
      }}
    >
      {/* ============ ARSENAL HEADER (toggles open/closed) ============ */}
      <Pressable onPress={toggleHeader}>
        {({ pressed }) => (
          <View
            style={{
              backgroundColor: '#FFCC00',
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: pressed ? 0.8 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#000000',
                fontSize: 10,
                letterSpacing: 2,
              }}
            >
              ◆ ARSENAL ◆
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  fontFamily: 'Silkscreen',
                  color: '#000000',
                  fontSize: 10,
                  letterSpacing: 1,
                }}
              >
                {totalAmmo} AMMO
              </Text>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#000000',
                  fontSize: 14,
                }}
              >
                {expanded ? '▴' : '▾'}
              </Text>
            </View>
          </View>
        )}
      </Pressable>

      {/* ============ NO-ROUND WARNING ============ */}
      {!roundActive && !loading && (
        <View
          style={{
            borderTopWidth: 2,
            borderTopColor: '#FF3333',
            padding: 8,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FF3333',
              fontSize: 9,
              textAlign: 'center',
            }}
          >
            ! NO ACTIVE ROUND — PAIR FIRST
          </Text>
        </View>
      )}

      {/* ============ PICKER — WORLD CARDS ============ */}
      {view === 'picker' && roundActive && (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={{ padding: 8 }}
        >
          <SubHeader label="◆ SELECT WORLD ◆" />
          {loading ? (
            <LoadingLine />
          ) : (
            <WorldGrid
              activities={activities}
              todayCounts={todayCounts}
              onPick={(w) => setView(w)}
            />
          )}
        </MotiView>
      )}

      {/* ============ WORLD — MOVES ============ */}
      {view !== 'collapsed' && view !== 'picker' && roundActive && (
        <MotiView
          from={{ opacity: 0, translateY: 6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 200 }}
          style={{ padding: 8 }}
        >
          <WorldMovesHeader
            world={view}
            activities={activities[view] ?? []}
            todayCounts={todayCounts}
            onBack={() => setView('picker')}
          />
          <WorldMovesList
            world={view}
            activities={activities[view] ?? []}
            todayCounts={todayCounts}
            strikeFlashMap={strikeFlashMap}
            onStrike={onStrike}
          />
        </MotiView>
      )}
    </View>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 6,
      }}
    >
      <View style={{ flex: 1, height: 2, backgroundColor: '#4A4A4A' }} />
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#FFCC00',
          fontSize: 9,
          letterSpacing: 2,
        }}
      >
        {label}
      </Text>
      <View style={{ flex: 1, height: 2, backgroundColor: '#4A4A4A' }} />
    </View>
  );
}

function WorldGrid({
  activities,
  todayCounts,
  onPick,
}: {
  activities: Record<World, Activity[]>;
  todayCounts: Record<string, number>;
  onPick: (world: World) => void;
}) {
  // Household is the hero; the other 5 worlds are satellites in a 3+2 layout.
  const satelliteWorlds: World[] = WORLD_ORDER.filter((w) => w !== 'household');
  const satelliteRows: World[][] = [
    satelliteWorlds.slice(0, 3),
    satelliteWorlds.slice(3, 5),
  ];

  // Compute household ammo for the hero card.
  const householdBucket = activities.household ?? [];
  const householdTotal = householdBucket.reduce(
    (sum, a) => sum + (a.daily_cap ?? 0),
    0
  );
  const householdUsed = householdBucket.reduce(
    (sum, a) => sum + Math.min(a.daily_cap ?? 0, todayCounts[a.id] ?? 0),
    0
  );
  const householdAmmo = Math.max(0, householdTotal - householdUsed);

  return (
    <View style={{ gap: 8 }}>
      <HouseholdHeroCard
        ammo={householdAmmo}
        totalAmmo={householdTotal}
        onPress={() => onPick('household')}
      />
      {satelliteRows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map((w) => {
            const bucket = activities[w] ?? [];
            const total = bucket.reduce(
              (sum, a) => sum + (a.daily_cap ?? 0),
              0
            );
            const used = bucket.reduce(
              (sum, a) => sum + Math.min(a.daily_cap ?? 0, todayCounts[a.id] ?? 0),
              0
            );
            const ammo = Math.max(0, total - used);
            return (
              <WorldCard
                key={w}
                world={w}
                ammo={ammo}
                totalAmmo={total}
                onPress={() => onPick(w)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Hero variant of the world card, reserved for HOUSEHOLD. Full-row width,
 * taller, bigger emoji, QUEST banner, and an "EARN ROUND POINTS" subtitle
 * to signal that chores are the sole path to round wins.
 */
function HouseholdHeroCard({
  ammo,
  totalAmmo,
  onPress,
}: {
  ammo: number;
  totalAmmo: number;
  onPress: () => void;
}) {
  const meta = WORLD_META.household;
  const depleted = ammo === 0;
  const accent = depleted ? '#4A4A4A' : meta.accentHex;
  const QUEST_YELLOW = '#FFCC00';

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View style={{ position: 'relative' }}>
          {/* Drop-shadow slab */}
          {!pressed && (
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                right: -3,
                bottom: -3,
                backgroundColor: '#000000',
              }}
            />
          )}

          {/* Card face */}
          <View
            style={{
              transform: [
                { translateX: pressed ? 3 : 0 },
                { translateY: pressed ? 3 : 0 },
              ],
              backgroundColor: depleted ? '#0a0a0a' : '#000000',
              borderWidth: 3,
              borderColor: accent,
              paddingVertical: 14,
              paddingHorizontal: 12,
              alignItems: 'center',
              minHeight: 160,
              opacity: depleted ? 0.7 : 1,
            }}
          >
            <CornerBracket position="top-left" color={accent} />
            <CornerBracket position="top-right" color={accent} />
            <CornerBracket position="bottom-left" color={accent} />
            <CornerBracket position="bottom-right" color={accent} />

            {/* QUEST banner (yellow for contrast against black + blue border) */}
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: depleted ? '#4A4A4A' : QUEST_YELLOW,
                fontSize: 9,
                letterSpacing: 2,
                marginBottom: 8,
              }}
            >
              ⚔ QUEST ⚔
            </Text>

            {/* Big emoji with idle float */}
            <MotiView
              from={{ translateY: 0 }}
              animate={{ translateY: depleted ? 0 : -2 }}
              transition={{
                type: 'timing',
                duration: 900,
                loop: !depleted,
                repeatReverse: true,
              }}
            >
              <Text style={{ fontSize: 48 }}>{meta.emoji}</Text>
            </MotiView>

            {/* Label */}
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: accent,
                fontSize: 12,
                marginTop: 8,
                letterSpacing: 2,
              }}
            >
              {meta.shortLabel}
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                fontFamily: 'Silkscreen',
                color: depleted ? '#4A4A4A' : '#8A8A8A',
                fontSize: 8,
                marginTop: 4,
                letterSpacing: 2,
              }}
            >
              EARN ROUND POINTS
            </Text>

            {/* Ammo pill — white text on blue accent reads better than black */}
            <View
              style={{
                marginTop: 10,
                backgroundColor: depleted ? '#0a0a0a' : accent,
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: accent,
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: depleted ? accent : '#FFFFFF',
                  fontSize: 10,
                  letterSpacing: 1,
                }}
              >
                {depleted ? 'DEPLETED' : `${ammo}/${totalAmmo} AMMO`}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Character-select style world tile. Chunky border in world accent, drop
 * shadow that the tile slides into on press, big emoji, corner brackets
 * for arcade flourish, ammo pill at the bottom.
 */
function WorldCard({
  world,
  ammo,
  totalAmmo,
  onPress,
}: {
  world: World;
  ammo: number;
  totalAmmo: number;
  onPress: () => void;
}) {
  const meta = WORLD_META[world];
  const depleted = ammo === 0;
  const accent = depleted ? '#4A4A4A' : meta.accentHex;

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <View style={{ position: 'relative' }}>
          {/* Drop-shadow slab */}
          {!pressed && (
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                right: -3,
                bottom: -3,
                backgroundColor: '#000000',
              }}
            />
          )}

          {/* Card face */}
          <View
            style={{
              transform: [
                { translateX: pressed ? 3 : 0 },
                { translateY: pressed ? 3 : 0 },
              ],
              backgroundColor: depleted ? '#0a0a0a' : '#000000',
              borderWidth: 2,
              borderColor: accent,
              paddingVertical: 10,
              paddingHorizontal: 6,
              alignItems: 'center',
              minHeight: 110,
              opacity: depleted ? 0.7 : 1,
            }}
          >
            {/* Corner brackets */}
            <CornerBracket position="top-left" color={accent} />
            <CornerBracket position="top-right" color={accent} />
            <CornerBracket position="bottom-left" color={accent} />
            <CornerBracket position="bottom-right" color={accent} />

            {/* Big emoji */}
            <MotiView
              from={{ translateY: 0 }}
              animate={{ translateY: depleted ? 0 : -2 }}
              transition={{
                type: 'timing',
                duration: 900,
                loop: !depleted,
                repeatReverse: true,
              }}
            >
              <Text style={{ fontSize: 28 }}>{meta.emoji}</Text>
            </MotiView>

            {/* Label */}
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: accent,
                fontSize: 9,
                marginTop: 6,
                letterSpacing: 1,
              }}
            >
              {meta.shortLabel}
            </Text>

            {/* Ammo pill */}
            <View
              style={{
                marginTop: 6,
                backgroundColor: depleted ? '#0a0a0a' : accent,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: accent,
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: depleted ? accent : '#000000',
                  fontSize: 8,
                  letterSpacing: 1,
                }}
              >
                {depleted ? 'DEPLETED' : `${ammo}/${totalAmmo}`}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function CornerBracket({
  position,
  color,
}: {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  color: string;
}) {
  const size = 5;
  const base = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderColor: color,
  };
  if (position === 'top-left')
    return (
      <View
        style={{ ...base, top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }}
      />
    );
  if (position === 'top-right')
    return (
      <View
        style={{ ...base, top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }}
      />
    );
  if (position === 'bottom-left')
    return (
      <View
        style={{
          ...base,
          bottom: -1,
          left: -1,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
        }}
      />
    );
  return (
    <View
      style={{
        ...base,
        bottom: -1,
        right: -1,
        borderBottomWidth: 2,
        borderRightWidth: 2,
      }}
    />
  );
}

function WorldMovesHeader({
  world,
  activities,
  todayCounts,
  onBack,
}: {
  world: World;
  activities: Activity[];
  todayCounts: Record<string, number>;
  onBack: () => void;
}) {
  const meta = WORLD_META[world];
  const ammo = useMemo(() => {
    let total = 0;
    for (const a of activities) {
      const used = todayCounts[a.id] ?? 0;
      total += Math.max(0, (a.daily_cap ?? 0) - used);
    }
    return total;
  }, [activities, todayCounts]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
      }}
    >
      {/* Back pill */}
      <Pressable onPress={onBack}>
        {({ pressed }) => (
          <View
            style={{
              backgroundColor: '#000000',
              borderWidth: 2,
              borderColor: '#FFCC00',
              paddingHorizontal: 8,
              paddingVertical: 4,
              opacity: pressed ? 0.7 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFCC00',
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              ◀ BACK
            </Text>
          </View>
        )}
      </Pressable>

      {/* World banner */}
      <View
        style={{
          flex: 1,
          backgroundColor: meta.accentHex,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingVertical: 4,
          gap: 6,
        }}
      >
        <Text style={{ fontSize: 14 }}>{meta.emoji}</Text>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#000000',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          {meta.label}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          style={{
            fontFamily: 'Silkscreen',
            color: '#000000',
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          {ammo} AMMO
        </Text>
      </View>
    </View>
  );
}

function WorldMovesList({
  world,
  activities,
  todayCounts,
  strikeFlashMap,
  onStrike,
}: {
  world: World;
  activities: Activity[];
  todayCounts: Record<string, number>;
  strikeFlashMap: Record<string, number>;
  onStrike: (activity: Activity) => void;
}) {
  if (activities.length === 0) {
    return (
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: WORLD_META[world].accentHex,
          fontSize: 9,
          textAlign: 'center',
          paddingVertical: 12,
        }}
      >
        NO MOVES IN THIS WORLD
      </Text>
    );
  }

  if (world === 'household') {
    const byTier: Record<HouseholdTier, Activity[]> = {
      daily: [],
      weekly: [],
      monthly: [],
    };
    for (const a of activities) if (a.tier) byTier[a.tier].push(a);
    return (
      <View>
        {HOUSEHOLD_TIERS.map((t) => {
          const rows = byTier[t];
          if (rows.length === 0) return null;
          return (
            <View key={t} style={{ marginBottom: 4 }}>
              <Text
                style={{
                  fontFamily: 'Silkscreen',
                  color: '#4A4A4A',
                  fontSize: 9,
                  letterSpacing: 2,
                  marginTop: 4,
                  marginBottom: 3,
                  marginLeft: 2,
                }}
              >
                ── {t.toUpperCase()}
              </Text>
              {rows.map((a) => renderMoveRow(a, todayCounts, strikeFlashMap, onStrike))}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      {activities.map((a) => renderMoveRow(a, todayCounts, strikeFlashMap, onStrike))}
    </View>
  );
}

function renderMoveRow(
  a: Activity,
  todayCounts: Record<string, number>,
  strikeFlashMap: Record<string, number>,
  onStrike: (activity: Activity) => void
) {
  const used = todayCounts[a.id] ?? 0;
  const usesLeft = Math.max(0, (a.daily_cap ?? 0) - used);
  return (
    <MoveCard
      key={a.id}
      activity={a}
      usesLeft={usesLeft}
      dailyCap={a.daily_cap ?? 1}
      accentHex={WORLD_META[a.world].accentHex}
      onStrike={() => onStrike(a)}
      strikeFlashKey={strikeFlashMap[a.id] ?? 0}
    />
  );
}

function LoadingLine() {
  return (
    <View style={{ padding: 10, alignItems: 'center' }}>
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
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 9,
          }}
        >
          LOADING…
        </Text>
      </MotiView>
    </View>
  );
}
