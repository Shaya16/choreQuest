import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';

import type { TributeTier } from '@/lib/types';

type Props = {
  tier: TributeTier | null; // null → tied
  margin: number;
  bonusCoins: number;
  winnerScore: number;
  loserScore: number;
  /** Framing of the stamp. Winner sees "FLAWLESS VICTORY", loser sees the
   * matching defeat phrasing. Tied ignores this. */
  perspective: 'winner' | 'loser' | 'tied';
  onComplete: () => void;
};

/**
 * The KO cinematic: arena flash → tier stamp → score tally → bonus reveal →
 * onComplete fires. Tap to skip. Tier=null renders the tied variant.
 */
export function KoOverlay(props: Props) {
  const [phase, setPhase] = useState<'flash' | 'stamp' | 'tally' | 'bonus' | 'cta'>(
    'flash'
  );

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const t1 = setTimeout(() => setPhase('stamp'), 600);
    const t2 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setPhase('tally');
    }, 1400);
    const t3 = setTimeout(() => setPhase('bonus'), 3200);
    const t4 = setTimeout(() => setPhase('cta'), 4400);
    return () => {
      [t1, t2, t3, t4].forEach(clearTimeout);
    };
  }, []);

  const stamp = stampLabel(props.tier, props.perspective);
  const stampColor = stampColorFor(props.tier, props.perspective);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        props.onComplete();
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {phase === 'flash' && (
        <MotiView
          from={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ type: 'timing', duration: 400 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#FFFFFF',
          }}
        />
      )}

      {phase !== 'flash' && (
        <MotiView
          from={{ scale: 0.4, rotate: '-12deg' }}
          animate={{ scale: 1, rotate: '-6deg' }}
          transition={{ type: 'spring', damping: 12 }}
          style={{ marginBottom: 24 }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: stampColor,
              fontSize: 24,
              textAlign: 'center',
              letterSpacing: 2,
            }}
          >
            {stamp}
          </Text>
        </MotiView>
      )}

      {(phase === 'tally' || phase === 'bonus' || phase === 'cta') && (
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 32,
              letterSpacing: 4,
            }}
          >
            {props.winnerScore} — {props.loserScore}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 12,
              marginTop: 8,
            }}
          >
            MARGIN +{props.margin}
          </Text>
        </View>
      )}

      {(phase === 'bonus' || phase === 'cta') && props.bonusCoins > 0 && (
        <MotiView
          from={{ translateY: 20, opacity: 0 }}
          animate={{ translateY: 0, opacity: 1 }}
          transition={{ type: 'spring' }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#9EFA00',
              fontSize: 14,
            }}
          >
            +{props.bonusCoins} COINS WIRED
          </Text>
        </MotiView>
      )}

      {phase === 'cta' && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#4A4A4A',
            fontSize: 8,
            position: 'absolute',
            bottom: 24,
          }}
        >
          TAP TO CONTINUE
        </Text>
      )}
    </Pressable>
  );
}

function stampLabel(
  tier: TributeTier | null,
  perspective: 'winner' | 'loser' | 'tied'
): string {
  if (perspective === 'tied' || !tier) return 'ROUND TIED';
  if (perspective === 'winner') {
    switch (tier) {
      case 'paper_cut':
        return 'K . O .';
      case 'knockout':
        return 'KNOCKOUT!';
      case 'total_carnage':
        return 'TOTAL CARNAGE!!';
      case 'flawless':
        return 'FLAWLESS VICTORY!!!';
    }
  }
  // Loser POV — reframes the stamp as defeat, not a celebration.
  switch (tier) {
    case 'paper_cut':
      return 'YOU LOST.';
    case 'knockout':
      return 'KNOCKED OUT!';
    case 'total_carnage':
      return 'BODIED!!';
    case 'flawless':
      return 'FLAWLESS DEFEAT!!!';
  }
}

function stampColorFor(
  tier: TributeTier | null,
  perspective: 'winner' | 'loser' | 'tied'
): string {
  if (perspective === 'tied' || !tier) return '#00DDFF';
  // Loser always sees red — doom framing.
  if (perspective === 'loser') return '#FF3333';
  switch (tier) {
    case 'flawless':
      return '#9EFA00';
    case 'total_carnage':
      return '#FF3333';
    case 'knockout':
      return '#FFCC00';
    case 'paper_cut':
      return '#FFB8DE';
  }
}
