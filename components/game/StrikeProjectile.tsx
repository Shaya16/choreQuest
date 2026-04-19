import { useEffect, useState } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { MotiView } from 'moti';

type Burst = {
  key: number;
  coins: number;
  accent: string;
  side: 'left' | 'right' | 'center';
};

type Props = {
  burst: Burst | null;
};

/**
 * Overlay effect that plays when a strike lands:
 *   1. Full-screen translucent flash in the world's accent color.
 *   2. A big chunky "+N" coin number that launches upward from the drawer
 *      area toward the appropriate fighter's side of the arena.
 *
 * Rendered absolute over the whole screen so the arena feels "hit" from
 * below. Self-unmounts after ~900ms by gating on the incoming `burst` key.
 */
export function StrikeProjectile({ burst }: Props) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!burst) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
  }, [burst]);

  if (!burst || !visible) return null;

  // Launch-point: bottom-center. Destination: top-left/right/center.
  const destX =
    burst.side === 'left'
      ? -(screenW * 0.35)
      : burst.side === 'right'
        ? screenW * 0.35
        : 0;
  const destY = -(screenH * 0.55);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
      }}
    >
      {/* Screen-edge flash */}
      <MotiView
        key={`flash-${burst.key}`}
        from={{ opacity: 0.45 }}
        animate={{ opacity: 0 }}
        transition={{ type: 'timing', duration: 350 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: burst.accent,
        }}
      />

      {/* Traveling "+N" */}
      <MotiView
        key={`proj-${burst.key}`}
        from={{ translateX: 0, translateY: 0, opacity: 1, scale: 0.6 }}
        animate={{
          translateX: destX,
          translateY: destY,
          opacity: 0,
          scale: 1.6,
        }}
        transition={{ type: 'timing', duration: 900 }}
        style={{
          position: 'absolute',
          bottom: screenH * 0.18,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 28,
            textShadowColor: '#000000',
            textShadowOffset: { width: 3, height: 3 },
            textShadowRadius: 0,
          }}
        >
          +{burst.coins}
        </Text>
      </MotiView>
    </View>
  );
}
