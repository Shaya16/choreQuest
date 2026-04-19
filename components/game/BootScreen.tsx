import { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { PRELOAD_IMAGES } from '@/lib/preload';

// Palette — cycled through for the border frame during boot
const PALETTE = [
  '#FFCC00',
  '#FF3333',
  '#00DDFF',
  '#FFB8DE',
  '#9EFA00',
  '#FFA63F',
  '#2121FF',
];

type Props = {
  fontsReady: boolean;
  sessionReady: boolean;
  arsenalReady: boolean;
  assetsReady: boolean;
  onComplete: () => void;
};

/**
 * Arcade-cabinet boot sequence. Stays mounted until every boot stage
 * completes (fonts → auth → arsenal catalog) plus a brief "READY PLAYER 1!"
 * flash, then fires `onComplete` so the parent can swap to the real nav.
 *
 * Visual stack:
 *   — Color-cycling pixel frame around the whole screen
 *   — Title "CHORE QUEST" with per-letter bounce-in stagger
 *   — "2P CO-OP RPG" subtitle + blinking ● BOOTING lamp
 *   — Three stage bars (FONTS / AUTH / ARSENAL) with wave-fill while pending
 *     and solid-accent when done
 *   — Bottom copyright line
 *   — "READY PLAYER 1!" flash overlay in the final 600ms
 */
export function BootScreen({
  fontsReady,
  sessionReady,
  arsenalReady,
  assetsReady,
  onComplete,
}: Props) {
  const allReady = fontsReady && sessionReady && arsenalReady && assetsReady;
  const [phase, setPhase] = useState<'booting' | 'ready'>('booting');
  const [frameColorIdx, setFrameColorIdx] = useState(0);

  // Keep a live ref to onComplete so the dismiss effect doesn't re-run (and
  // reset its timer) every time the parent re-renders with a fresh closure.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Cycle border color through the palette for that arcade-cabinet glow
  useEffect(() => {
    const t = setInterval(() => {
      setFrameColorIdx((i) => (i + 1) % PALETTE.length);
    }, 380);
    return () => clearInterval(t);
  }, []);

  // Stage 1: once everything's loaded, flip to the READY flash after a beat.
  useEffect(() => {
    if (!allReady || phase !== 'booting') return;
    const t = setTimeout(() => setPhase('ready'), 300);
    return () => clearTimeout(t);
  }, [allReady, phase]);

  // Stage 2: let the flash breathe for 600ms, then dismiss. Uses the ref so
  // parent re-renders don't restart the countdown.
  useEffect(() => {
    if (phase !== 'ready') return;
    const t = setTimeout(() => onCompleteRef.current(), 600);
    return () => clearTimeout(t);
  }, [phase]);

  const frameColor = PALETTE[frameColorIdx] ?? '#FFCC00';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#000000',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* Color-cycling pixel frame */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          bottom: 16,
          borderWidth: 4,
          borderColor: frameColor,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          right: 24,
          bottom: 24,
          borderWidth: 1,
          borderColor: '#4A4A4A',
        }}
      />

      {/* Faint scanlines across the whole screen */}
      <Scanlines />

      {/* ============ TITLE ============ */}
      <StaggerTitle text="CHORE QUEST" />

      <Text
        style={{
          fontFamily: 'Silkscreen',
          color: '#9EFA00',
          fontSize: 12,
          marginTop: 6,
          letterSpacing: 4,
        }}
      >
        ● 2P CO-OP RPG ●
      </Text>

      {/* ============ BLINKING BOOTING LAMP ============ */}
      <MotiView
        from={{ opacity: 0.25 }}
        animate={{ opacity: 1 }}
        transition={{
          type: 'timing',
          duration: 500,
          loop: true,
          repeatReverse: true,
        }}
        style={{ marginTop: 18 }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FF3333',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          ● BOOTING…
        </Text>
      </MotiView>

      {/* ============ PROGRESS BARS ============ */}
      <View style={{ marginTop: 22, gap: 8 }}>
        <StageBar label="FONTS" done={fontsReady} accent="#FFCC00" />
        <StageBar label="AUTH" done={sessionReady} accent="#00DDFF" />
        <StageBar label="ARSENAL" done={arsenalReady} accent="#FFB8DE" />
        <StageBar label="SPRITES" done={assetsReady} accent="#FFA63F" />
      </View>

      {/* Off-screen image tiles — rendering them here forces the GPU decode
          pass so the first real mount after boot isn't a white flash.
          1×1px, opacity 0, absolutely-positioned off-frame. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -10,
          left: -10,
          width: 1,
          height: 1,
          opacity: 0,
        }}
      >
        {PRELOAD_IMAGES.map((src, i) => (
          <Image key={i} source={src} style={{ width: 1, height: 1 }} />
        ))}
      </View>

      {/* ============ FOOTER ============ */}
      <View
        style={{ position: 'absolute', bottom: 30, alignItems: 'center' }}
      >
        <Text
          style={{
            fontFamily: 'Silkscreen',
            color: '#4A4A4A',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          © 2026 · CHORE QUEST CO.
        </Text>
        <Text
          style={{
            fontFamily: 'Silkscreen',
            color: '#4A4A4A',
            fontSize: 9,
            marginTop: 2,
            letterSpacing: 1,
          }}
        >
          INSERT COIN TO CONTINUE
        </Text>
      </View>

      {/* ============ READY OVERLAY ============ */}
      {phase === 'ready' && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MotiView
            from={{ scale: 0.3, opacity: 0, rotate: '-10deg' }}
            animate={{ scale: 1, opacity: 1, rotate: '0deg' }}
            transition={{ type: 'timing', duration: 260 }}
          >
            <View
              style={{
                backgroundColor: '#9EFA00',
                paddingHorizontal: 22,
                paddingVertical: 14,
                borderWidth: 4,
                borderColor: '#000000',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#000000',
                  fontSize: 16,
                  letterSpacing: 3,
                  textShadowColor: '#FFCC00',
                  textShadowOffset: { width: 2, height: 2 },
                  textShadowRadius: 0,
                }}
              >
                READY PLAYER 1!
              </Text>
            </View>
          </MotiView>
        </View>
      )}
    </View>
  );
}

/**
 * Big title with per-letter drop-in animation. Each letter bounces in from
 * above with staggered delay so it reads like a coin-op attract-mode logo.
 */
function StaggerTitle({ text }: { text: string }) {
  const letters = text.split('');
  return (
    <View style={{ flexDirection: 'row' }}>
      {letters.map((ch, i) => (
        <MotiView
          key={i}
          from={{ translateY: -40, opacity: 0, scale: 0.6 }}
          animate={{ translateY: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 320, delay: i * 55 }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 26,
              letterSpacing: 1,
              textShadowColor: '#FF3333',
              textShadowOffset: { width: 3, height: 3 },
              textShadowRadius: 0,
            }}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </Text>
        </MotiView>
      ))}
    </View>
  );
}

/**
 * Per-stage loading bar. 8 pips total. While pending the fill sweeps as a
 * short wave; when done every pip snaps solid in the stage's accent color
 * and an "OK" label replaces the "..." to make it read as complete.
 */
function StageBar({
  label,
  done,
  accent,
}: {
  label: string;
  done: boolean;
  accent: string;
}) {
  const pipCount = 8;
  const [wave, setWave] = useState(0);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => {
      setWave((w) => (w + 1) % pipCount);
    }, 140);
    return () => clearInterval(t);
  }, [done]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: done ? accent : '#FFFFFF',
          fontSize: 9,
          width: 74,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {Array.from({ length: pipCount }).map((_, i) => {
          // During the wave, light up 3 consecutive pips around the current
          // index so it reads like a ping-pong sweep.
          const active =
            i === wave || i === (wave + 1) % pipCount || i === (wave + 2) % pipCount;
          const filled = done || active;
          return (
            <View
              key={i}
              style={{
                width: 14,
                height: 10,
                backgroundColor: filled ? accent : '#0a0a0a',
                borderWidth: 1,
                borderColor: accent,
              }}
            />
          );
        })}
      </View>
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: done ? accent : '#4A4A4A',
          fontSize: 8,
          width: 22,
        }}
      >
        {done ? 'OK' : '...'}
      </Text>
    </View>
  );
}

/**
 * Low-opacity horizontal scanlines for that CRT-monitor mood. Pure cosmetic;
 * absolutely-positioned and pointerEvents none so it never blocks taps.
 */
function Scanlines() {
  const lineCount = 40;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {Array.from({ length: lineCount }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 1,
            backgroundColor: '#FFFFFF',
            opacity: 0.03,
            marginBottom: 15,
          }}
        />
      ))}
    </View>
  );
}
