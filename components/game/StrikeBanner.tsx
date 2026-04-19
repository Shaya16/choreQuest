import { useEffect, useRef } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { MotiView } from 'moti';
import { useRouter } from 'expo-router';

import { ACCENT_HEX, CLASS_META } from '@/lib/characters';
import type { Player, Activity } from '@/lib/types';

export type StrikeBannerEvent = {
  id: string;
  partner: Player;
  activity: Activity;
  coins: number;
};

type Props = {
  event: StrikeBannerEvent | null;
  onDismiss: () => void;
};

/**
 * Sliding banner for partner strikes. Auto-dismisses after 3s. Mounts above
 * the nav stack so it floats over whichever tab the user is on. Tap navigates
 * to the home tab so the user can strike back.
 */
export function StrikeBanner({ event, onDismiss }: Props) {
  const router = useRouter();
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!event) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(onDismiss, 3000);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [event, onDismiss]);

  if (!event) return null;

  const meta = CLASS_META[event.partner.arcade_class];
  const accent = ACCENT_HEX[meta.accent];

  return (
    <MotiView
      key={event.id}
      from={{ translateY: -80, opacity: 0 }}
      animate={{ translateY: 0, opacity: 1 }}
      exit={{ translateY: -80, opacity: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      style={{
        position: 'absolute',
        top: 48,
        left: 12,
        right: 12,
        zIndex: 1000,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          onDismiss();
          router.push('/(tabs)');
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#000000',
            borderWidth: 3,
            borderColor: accent,
            padding: 10,
            gap: 10,
          }}
        >
          <Image
            source={meta.sprite}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: accent,
                fontSize: 10,
                marginBottom: 2,
              }}
            >
              {event.partner.display_name.toUpperCase()} STRUCK
            </Text>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFFFFF',
                fontSize: 9,
              }}
              numberOfLines={1}
            >
              {event.activity.name} · +{event.coins}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </MotiView>
  );
}
