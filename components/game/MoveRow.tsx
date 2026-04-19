import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { WORLD_META } from '@/lib/worlds';
import type { Activity } from '@/lib/types';

type Props = {
  activity: Activity;
  usesLeft: number;
  dailyCap: number;
  onStrike: () => void;
  strikeKey: number; // bump to trigger hit flash
};

/**
 * Compact single-line move entry for the drawer:
 *   [🏋️ GYM]  SQUATS               +30  ▰▰▱
 *
 * Tapping strikes instantly. Depleted rows dim + show a small · mark.
 */
export function MoveRow({
  activity,
  usesLeft,
  dailyCap,
  onStrike,
  strikeKey,
}: Props) {
  const meta = WORLD_META[activity.world];
  const depleted = usesLeft <= 0;
  const payout = (activity.base_value ?? 0) + (activity.bonus ?? 0);

  const [flashing, setFlashing] = useState(false);
  const lastKey = useRef(strikeKey);
  useEffect(() => {
    if (strikeKey !== lastKey.current) {
      lastKey.current = strikeKey;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 220);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [strikeKey]);

  return (
    <Pressable onPress={depleted ? undefined : onStrike}>
      {({ pressed }) => (
        <MotiView
          key={`row-${strikeKey}`}
          from={{ scale: 1 }}
          animate={{ scale: strikeKey > 0 && flashing ? 1.02 : 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: flashing ? meta.accentHex : '#000000',
            borderWidth: 2,
            borderColor: depleted ? '#4A4A4A' : meta.accentHex,
            paddingHorizontal: 6,
            paddingVertical: 6,
            marginBottom: 4,
            opacity: depleted ? 0.4 : pressed ? 0.7 : 1,
          }}
        >
          {/* World chip */}
          <View
            style={{
              backgroundColor: depleted ? '#4A4A4A' : meta.accentHex,
              paddingHorizontal: 4,
              paddingVertical: 2,
              minWidth: 40,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 12 }}>{meta.emoji}</Text>
          </View>

          {/* Name */}
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'PressStart2P',
                color: flashing ? '#000000' : depleted ? '#4A4A4A' : '#FFFFFF',
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              {activity.name.toUpperCase()}
            </Text>
          </View>

          {/* Payout */}
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: flashing ? '#000000' : depleted ? '#4A4A4A' : '#FFCC00',
              fontSize: 11,
              marginRight: 8,
            }}
          >
            +{payout}
          </Text>

          {/* Ammo pips */}
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {Array.from({ length: dailyCap }).map((_, i) => {
              const filled = i < usesLeft;
              return (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 10,
                    backgroundColor: filled
                      ? depleted
                        ? '#4A4A4A'
                        : meta.accentHex
                      : 'transparent',
                    borderWidth: 1,
                    borderColor: depleted ? '#4A4A4A' : meta.accentHex,
                  }}
                />
              );
            })}
          </View>
        </MotiView>
      )}
    </Pressable>
  );
}
