import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { MotiView } from 'moti';

type Props = {
  coins: number;
  xp: number;
  strikes: number;
  pulseKey: number;
};

/**
 * Arcade HUD strip across the top of the Strike Select screen. Shows
 * today's coin haul, xp, and strike count. Pops briefly whenever pulseKey
 * bumps (i.e. the player just landed a strike) to sell the feedback loop.
 */
export function TodayHaulHUD({ coins, xp, strikes, pulseKey }: Props) {
  const [coinDelta, setCoinDelta] = useState<number | null>(null);
  const prevCoinsRef = useRef(coins);

  useEffect(() => {
    if (coins > prevCoinsRef.current) {
      const delta = coins - prevCoinsRef.current;
      setCoinDelta(delta);
      const t = setTimeout(() => setCoinDelta(null), 900);
      prevCoinsRef.current = coins;
      return () => clearTimeout(t);
    }
    prevCoinsRef.current = coins;
    return undefined;
  }, [coins]);

  return (
    <View
      style={{
        backgroundColor: '#000000',
        borderWidth: 3,
        borderColor: '#FFCC00',
        paddingHorizontal: 10,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 9,
            letterSpacing: 2,
          }}
        >
          ◆ TODAY&apos;S HAUL ◆
        </Text>
        <MotiView
          from={{ opacity: 0.3 }}
          animate={{ opacity: 1 }}
          transition={{
            type: 'timing',
            duration: 600,
            loop: true,
            repeatReverse: true,
          }}
        >
          <Text
            style={{
              fontFamily: 'Silkscreen',
              color: '#9EFA00',
              fontSize: 9,
              marginTop: 2,
              letterSpacing: 1,
            }}
          >
            ● LIVE
          </Text>
        </MotiView>
      </View>

      <View style={{ position: 'relative', flexDirection: 'row', gap: 12 }}>
        <Stat label="COIN" value={coins} color="#FFCC00" pulseKey={pulseKey} />
        <Stat label="XP" value={xp} color="#9EFA00" pulseKey={pulseKey} />
        <Stat
          label="HITS"
          value={strikes}
          color="#FF3333"
          pulseKey={pulseKey}
        />

        {coinDelta != null && (
          <MotiView
            key={`delta-${pulseKey}`}
            from={{ translateY: 0, opacity: 1, scale: 0.9 }}
            animate={{ translateY: -28, opacity: 0, scale: 1.5 }}
            transition={{ type: 'timing', duration: 900 }}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              zIndex: 10,
            }}
            pointerEvents="none"
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFCC00',
                fontSize: 14,
                textShadowColor: '#FF3333',
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 0,
              }}
            >
              +{coinDelta}
            </Text>
          </MotiView>
        )}
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
  pulseKey,
}: {
  label: string;
  value: number;
  color: string;
  pulseKey: number;
}) {
  return (
    <View style={{ alignItems: 'center', minWidth: 46 }}>
      <Text
        style={{
          fontFamily: 'Silkscreen',
          color: '#4A4A4A',
          fontSize: 8,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
      <MotiView
        key={`pulse-${pulseKey}-${label}`}
        from={{ scale: 1.3 }}
        animate={{ scale: 1 }}
        transition={{ type: 'timing', duration: 260 }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color,
            fontSize: 14,
            marginTop: 2,
          }}
        >
          {value}
        </Text>
      </MotiView>
    </View>
  );
}
