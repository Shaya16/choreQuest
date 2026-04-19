import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import type { ShopItem } from '@/lib/types';

type Props = {
  item: ShopItem;
  accentHex: string;
  onLockIn: (item: ShopItem) => void;
};

/**
 * Face-down tribute card. Tap once → flip and reveal item. Tap a revealed
 * card → lock it in (parent calls onLockIn). Idle hover-bounces while
 * face-down or revealed-but-not-locked.
 */
export function TributeCard({ item, accentHex, onLockIn }: Props) {
  const [revealed, setRevealed] = useState(false);
  const flip = useSharedValue(0); // 0 = face-down, 1 = face-up

  // Idle bob — small upward float, looped.
  const bob = useSharedValue(0);
  if (bob.value === 0) {
    bob.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 700 }),
        withTiming(0, { duration: 700 })
      ),
      -1,
      false
    );
  }

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }],
  }));

  const faceDownStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateY: `${flip.value * 180}deg` },
    ],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));

  const faceUpStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateY: `${flip.value * 180 - 180}deg` },
    ],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!revealed) {
      flip.value = withSpring(1, { damping: 14, stiffness: 120 });
      setRevealed(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onLockIn(item);
    }
  }

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[{ width: 140, height: 200 }, wrapperStyle]}>
        {/* Face-down */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: '#000',
              borderWidth: 3,
              borderColor: accentHex,
              alignItems: 'center',
              justifyContent: 'center',
            },
            faceDownStyle,
          ]}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: accentHex,
              fontSize: 28,
            }}
          >
            ?
          </Text>
        </Animated.View>

        {/* Face-up */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: '#000',
              borderWidth: 3,
              borderColor: '#FFCC00',
              padding: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            faceUpStyle,
          ]}
        >
          <Text style={{ fontSize: 36 }}>{extractIcon(item.name)}</Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 8,
              textAlign: 'center',
            }}
            numberOfLines={3}
          >
            {stripIcon(item.name).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 8,
            }}
          >
            {item.cost}¢
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
