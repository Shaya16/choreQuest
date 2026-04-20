import { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { AnimatedSprite } from './AnimatedSprite';
import { DebtCaption, debtAccent, type DebtVariant } from './DebtBadge';
import { DebtChip } from '../ui/DebtChip';
import {
  ACCENT_HEX,
  CLASS_META,
  DEFAULT_SHEET_FRAME_H,
  DEFAULT_SHEET_FRAME_W,
} from '@/lib/characters';
import { COIN_SPRITE } from '@/lib/worlds';
import type { Player } from '@/lib/types';

type Props = {
  player: Player | null;
  score: number;
  side: 'left' | 'right';
  isLeader: boolean;
  attackKey: number; // increments when this player lands a hit — triggers lunge + pop
  lastDelta: number | null;
  maxScoreHint: number;
  coins?: number;
  debt?: { variant: DebtVariant; itemName: string } | null;
  inDebt?: boolean;
  onDebtPress?: () => void;
};

export function FighterCard({
  player,
  score,
  side,
  isLeader,
  attackKey,
  lastDelta,
  maxScoreHint,
  coins,
  debt,
  inDebt,
  onDebtPress,
}: Props) {
  const meta = player ? CLASS_META[player.arcade_class] : null;
  const accentHex = meta ? ACCENT_HEX[meta.accent] : '#4A4A4A';
  const facingFlip = side === 'left' ? 1 : -1;

  // Score bar fill (0..1). Clamp to avoid zero-division.
  const cap = Math.max(100, maxScoreHint, score);
  const fill = Math.min(1, score / cap);

  const [damageShown, setDamageShown] = useState<number | null>(null);
  const [animMode, setAnimMode] = useState<'idle' | 'attack'>('idle');
  const [flashKey, setFlashKey] = useState(0); // drives the strike flash overlay
  const lastAttackKey = useRef(attackKey);

  useEffect(() => {
    if (attackKey === lastAttackKey.current) return undefined;
    lastAttackKey.current = attackKey;

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Attack cycle: 3 frames × 150ms = 450ms per loop, held for 5 loops ≈ 2.25s.
    setAnimMode('attack');

    // Entry flash — confirms the strike registered even if the sprite render
    // stalls. Remount-via-key so Moti replays from scratch each hit.
    setFlashKey((k) => k + 1);

    // Exit flash fires ~80ms before the mode swap, so the idle sheet reveals
    // inside a burst instead of popping in mid-air. Same key-bump mechanism.
    timers.push(setTimeout(() => setFlashKey((k) => k + 1), 2170));
    timers.push(setTimeout(() => setAnimMode('idle'), 2250));

    if (lastDelta && lastDelta > 0) {
      setDamageShown(lastDelta);
      timers.push(setTimeout(() => setDamageShown(null), 1400));
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [attackKey, lastDelta]);

  // Attack takes priority on strike. Fall back to walk, then idle, then static.
  const activeSheet =
    animMode === 'attack'
      ? meta?.attackSheet ?? meta?.walkSheet ?? meta?.idleSheet ?? null
      : meta?.idleSheet ?? meta?.walkSheet ?? null;

  // Warm the attack PNG into the image cache up front — first strike would
  // otherwise hit the animation window with an unloaded asset and render blank.
  const preloadAttack = meta?.attackSheet?.source;

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 2,
      }}
    >
      {/* Character stage */}
      <View
        style={{
          height: 190,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 4,
          overflow: 'visible',
        }}
      >
        {/* Hidden preload — forces the attack PNG into the image cache so the
            first strike doesn't land on an unloaded asset. */}
        {preloadAttack && (
          <Image
            source={preloadAttack}
            style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
          />
        )}

        {/* Strike flash — 180ms accent-colored pop behind the sprite. Runs on
            every hit independent of sprite timing, so if the attack sheet is
            slow to decode the user still sees the strike registered. */}
        {flashKey > 0 && (
          <MotiView
            key={`flash-${flashKey}`}
            from={{ opacity: 0.9, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ type: 'timing', duration: 260 }}
            style={{
              position: 'absolute',
              width: 120,
              height: 120,
              borderRadius: 999,
              backgroundColor: accentHex,
              alignSelf: 'center',
              bottom: 20,
            }}
          />
        )}

        {/* Damage popup */}
        {damageShown != null && (
          <MotiView
            key={`dmg-${attackKey}`}
            from={{ translateY: 0, opacity: 1, scale: 0.8 }}
            animate={{ translateY: -50, opacity: 0, scale: 1.6 }}
            transition={{ type: 'timing', duration: 1400 }}
            style={{
              position: 'absolute',
              top: 12,
              zIndex: 10,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFCC00',
                fontSize: 16,
                textShadowColor: '#FF3333',
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 0,
              }}
            >
              +{damageShown}
            </Text>
          </MotiView>
        )}

        {/* Leader crown — bobs above the sprite's head */}
        {isLeader && (
          <MotiView
            from={{ translateY: 0 }}
            animate={{ translateY: -6 }}
            transition={{
              type: 'timing',
              duration: 900,
              loop: true,
              repeatReverse: true,
            }}
            style={{
              position: 'absolute',
              top: -34,
              alignSelf: 'center',
              zIndex: 5,
            }}
          >
            <Image
              source={require('@/assets/sprites/crown.png')}
              style={{ width: 40, height: 30 }}
              resizeMode="contain"
            />
          </MotiView>
        )}

        {/* Sprite: bob + subtle breathing pace. No lunge layer — the attack
            sprite sheet itself plays the strike motion. */}
        {meta ? (
          <MotiView
            from={{ translateY: 0 }}
            animate={{ translateY: -6 }}
            transition={{
              type: 'timing',
              duration: 900,
              loop: true,
              repeatReverse: true,
            }}
          >
            <MotiView
              from={{ scale: 1 }}
              animate={{ scale: 1.04 }}
              transition={{
                type: 'timing',
                duration: 2400,
                loop: true,
                repeatReverse: true,
                delay: side === 'left' ? 0 : 1200,
              }}
            >
              {activeSheet ? (
                <AnimatedSprite
                  sheet={activeSheet.source}
                  frameCount={activeSheet.frames}
                  sourceFrameWidth={activeSheet.frameW ?? DEFAULT_SHEET_FRAME_W}
                  sourceFrameHeight={activeSheet.frameH ?? DEFAULT_SHEET_FRAME_H}
                  displayWidth={180}
                  frameDurationMs={activeSheet.durationMs ?? 120}
                  facingFlip={facingFlip as 1 | -1}
                />
              ) : (
                <Image
                  source={meta.sprite}
                  style={{
                    width: 180,
                    height: 180,
                    transform: [{ scaleX: facingFlip }],
                  }}
                  resizeMode="contain"
                />
              )}
            </MotiView>
          </MotiView>
        ) : (
          <EmptySlot side={side} />
        )}
      </View>

      {/* Name — centered between sprite and bar */}
      <View
        style={{
          alignItems: 'center',
          marginTop: 8,
          marginBottom: 4,
          minHeight: 18,
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: accentHex,
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          {side === 'left' ? 'P1' : 'P2'}
          {player?.display_name ? ` · ${player.display_name.toUpperCase()}` : ''}
        </Text>
      </View>

      {inDebt && (
        <View
          style={{
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <DebtChip onPress={onDebtPress} />
        </View>
      )}

      {/* Score bar — BELOW name */}
      <View
        style={{
          height: 14,
          backgroundColor: '#000000',
          borderWidth: 2,
          borderColor: '#FFFFFF',
          marginBottom: 6,
          overflow: 'hidden',
          flexDirection: side === 'left' ? 'row' : 'row-reverse',
        }}
      >
        <MotiView
          from={{ width: '0%' }}
          animate={{ width: `${fill * 100}%` }}
          transition={{ type: 'timing', duration: 450 }}
          style={{
            height: '100%',
            backgroundColor: debt ? debtAccent(debt.variant) : accentHex,
          }}
        />
      </View>

      {/* XP + coins row — BELOW bar */}
      <View
        style={{
          flexDirection: side === 'left' ? 'row' : 'row-reverse',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 12,
          }}
        >
          {`XP ${score}`}
        </Text>
        {coins != null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Image
              source={COIN_SPRITE}
              style={{ width: 12, height: 12 }}
              resizeMode="contain"
            />
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFCC00',
                fontSize: 10,
              }}
            >
              {coins.toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {debt && (
        <View style={{ marginTop: 4, alignItems: 'center' }}>
          <DebtCaption variant={debt.variant} itemName={debt.itemName} />
        </View>
      )}
    </View>
  );
}

function EmptySlot({ side }: { side: 'left' | 'right' }) {
  return (
    <View
      style={{
        width: 180,
        height: 180,
        borderWidth: 3,
        borderColor: '#4A4A4A',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MotiView
        from={{ opacity: 0.3 }}
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
            color: '#4A4A4A',
            fontSize: 10,
            textAlign: 'center',
          }}
        >
          {side === 'right' ? 'WAITING\nFOR\nP2…' : 'EMPTY'}
        </Text>
      </MotiView>
    </View>
  );
}
