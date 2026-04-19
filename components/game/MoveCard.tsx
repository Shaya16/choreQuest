import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';

import { COIN_SPRITE } from '@/lib/worlds';
import type { Activity } from '@/lib/types';

type Props = {
  activity: Activity;
  usesLeft: number;
  dailyCap: number;
  accentHex: string;
  onStrike: () => void;
  strikeFlashKey: number;
};

/**
 * Arsenal move card. Left rail shows payout(s), content column shows the
 * move name + qualifier + optional badges, right rail shows ammo pips.
 * Chore rows (household, round_value > 0) show two stacked numbers on the
 * left rail: round points in world accent (top) and shop coins in yellow
 * (bottom). Non-chore rows show a single centered shop-coin number.
 */
export function MoveCard({
  activity,
  usesLeft,
  dailyCap,
  accentHex,
  onStrike,
  strikeFlashKey,
}: Props) {
  const depleted = usesLeft <= 0;
  const shopCoins = (activity.base_value ?? 0) + (activity.bonus ?? 0);
  const roundPts = activity.round_value ?? 0;
  const isChore = roundPts > 0;
  const isBonusMove = (activity.bonus ?? 0) > 0;

  const [flashDamage, setFlashDamage] = useState<number | null>(null);
  const lastKey = useRef(strikeFlashKey);

  useEffect(() => {
    if (strikeFlashKey !== lastKey.current) {
      lastKey.current = strikeFlashKey;
      setFlashDamage(shopCoins);
      const t = setTimeout(() => setFlashDamage(null), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [strikeFlashKey, shopCoins]);

  return (
    <Pressable
      onPress={depleted ? undefined : onStrike}
      style={{ marginBottom: 8 }}
    >
      {({ pressed }) => (
        <View style={{ position: 'relative' }}>
          {!pressed && !depleted && (
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

          <MotiView
            key={`hit-${strikeFlashKey}`}
            from={{ scale: 1 }}
            animate={{ scale: strikeFlashKey > 0 ? [1, 1.04, 1] : 1 }}
            transition={{ type: 'timing', duration: 260 }}
            style={{
              transform: [
                { translateX: pressed && !depleted ? 4 : 0 },
                { translateY: pressed && !depleted ? 4 : 0 },
              ],
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: depleted ? '#111111' : '#000000',
                borderWidth: 3,
                borderColor: depleted ? '#4A4A4A' : accentHex,
                opacity: depleted ? 0.45 : 1,
                minHeight: 72,
              }}
            >
              {/* Left rail: payout(s) */}
              <View
                style={{
                  width: 76,
                  borderRightWidth: 2,
                  borderRightColor: depleted ? '#4A4A4A' : accentHex,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 4,
                  paddingHorizontal: 4,
                  backgroundColor: depleted ? '#0a0a0a' : 'rgba(0,0,0,0.6)',
                }}
              >
                {isChore ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        style={{
                          fontFamily: 'PressStart2P',
                          color: depleted ? '#4A4A4A' : accentHex,
                          fontSize: 16,
                        }}
                      >
                        +{roundPts}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'PressStart2P',
                          color: depleted ? '#4A4A4A' : accentHex,
                          fontSize: 8,
                          letterSpacing: 1,
                        }}
                      >
                        XP
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                      <Image
                        source={COIN_SPRITE}
                        style={{ width: 12, height: 12, opacity: depleted ? 0.45 : 1 }}
                        resizeMode="contain"
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: 'PressStart2P',
                          color: depleted ? '#4A4A4A' : '#FFCC00',
                          fontSize: 12,
                        }}
                      >
                        +{shopCoins}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Image
                      source={COIN_SPRITE}
                      style={{ width: 16, height: 16, opacity: depleted ? 0.45 : 1 }}
                      resizeMode="contain"
                    />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={{
                        fontFamily: 'PressStart2P',
                        color: depleted ? '#4A4A4A' : '#FFCC00',
                        fontSize: 18,
                      }}
                    >
                      +{shopCoins}
                    </Text>
                  </View>
                )}
              </View>

              {/* Content: name + qualifier + badges */}
              <View
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: depleted ? '#4A4A4A' : '#FFFFFF',
                    fontSize: 10,
                    lineHeight: 14,
                  }}
                  numberOfLines={2}
                >
                  {activity.name}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Silkscreen',
                    color: depleted ? '#4A4A4A' : '#8A8A8A',
                    fontSize: 9,
                    letterSpacing: 1,
                    marginTop: 3,
                    minHeight: 11,
                  }}
                  numberOfLines={1}
                >
                  {activity.description ?? ''}
                </Text>
                {(isBonusMove || activity.requires_photo || activity.tier) && (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      marginTop: 4,
                      gap: 4,
                    }}
                  >
                    {isBonusMove && (
                      <Badge label="★ BONUS" color="#FFCC00" dim={depleted} />
                    )}
                    {activity.requires_photo && (
                      <Badge label="📷 PHOTO" color="#00DDFF" dim={depleted} />
                    )}
                    {activity.tier && (
                      <Badge
                        label={activity.tier.toUpperCase()}
                        color="#FFB8DE"
                        dim={depleted}
                      />
                    )}
                  </View>
                )}
              </View>

              {/* Right rail: ammo pips */}
              <View
                style={{
                  width: 52,
                  borderLeftWidth: 2,
                  borderLeftColor: depleted ? '#4A4A4A' : accentHex,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 4,
                  backgroundColor: depleted ? '#0a0a0a' : 'rgba(0,0,0,0.6)',
                }}
              >
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {Array.from({ length: dailyCap }).map((_, i) => {
                    const filled = i < usesLeft;
                    return (
                      <View
                        key={i}
                        style={{
                          width: 8,
                          height: 12,
                          backgroundColor: filled
                            ? depleted
                              ? '#4A4A4A'
                              : accentHex
                            : '#000000',
                          borderWidth: 1,
                          borderColor: depleted ? '#4A4A4A' : accentHex,
                        }}
                      />
                    );
                  })}
                </View>
              </View>

              {depleted && (
                <View
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
                  <View
                    style={{
                      borderWidth: 2,
                      borderColor: '#FF3333',
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      transform: [{ rotate: '-8deg' }],
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'PressStart2P',
                        color: '#FF3333',
                        fontSize: 10,
                        letterSpacing: 2,
                      }}
                    >
                      DEPLETED
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {flashDamage != null && (
              <MotiView
                key={`dmg-${strikeFlashKey}`}
                from={{ translateY: 0, opacity: 1, scale: 0.8 }}
                animate={{ translateY: -40, opacity: 0, scale: 1.6 }}
                transition={{ type: 'timing', duration: 900 }}
                style={{
                  position: 'absolute',
                  top: 20,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                  zIndex: 10,
                }}
                pointerEvents="none"
              >
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: '#FFCC00',
                    fontSize: 18,
                    textShadowColor: '#FF3333',
                    textShadowOffset: { width: 2, height: 2 },
                    textShadowRadius: 0,
                  }}
                >
                  +{flashDamage}
                </Text>
              </MotiView>
            )}
          </MotiView>
        </View>
      )}
    </Pressable>
  );
}

function Badge({
  label,
  color,
  dim,
}: {
  label: string;
  color: string;
  dim: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: dim ? '#4A4A4A' : color,
        paddingHorizontal: 4,
        paddingVertical: 1,
      }}
    >
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: dim ? '#4A4A4A' : color,
          fontSize: 7,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
