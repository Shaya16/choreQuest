import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const HOLD_MS = 1200;

type Props = {
  label: string;
  accentHex: string;
  onComplete: () => void;
};

/**
 * Hold-to-charge button. Hold for HOLD_MS to fire onComplete. Release early
 * → cancels with soft fizzle haptic. Used as the round-tribute finisher.
 */
export function HoldToCollect({ label, accentHex, onComplete }: Props) {
  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const completedRef = useRef(false);
  const hapticTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  function startHold() {
    completedRef.current = false;
    setHolding(true);
    progress.value = withTiming(
      1,
      { duration: HOLD_MS, easing: Easing.linear },
      (finished) => {
        if (finished) {
          // Worklet → JS: trigger via a non-shared ref pattern.
        }
      }
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Ramp up haptics over the hold duration.
    let beat = 0;
    hapticTimer.current = setInterval(() => {
      beat++;
      if (beat < 3) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else if (beat < 6) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, HOLD_MS / 8);

    // Schedule completion on the JS thread (matches the worklet's duration).
    setTimeout(() => {
      if (!completedRef.current && holding) {
        completedRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        clearTimer();
        onComplete();
      }
    }, HOLD_MS);
  }

  function endHold() {
    setHolding(false);
    if (!completedRef.current) {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: 200 });
      Haptics.selectionAsync();
    }
    clearTimer();
  }

  function clearTimer() {
    if (hapticTimer.current) {
      clearInterval(hapticTimer.current);
      hapticTimer.current = null;
    }
  }

  useEffect(() => () => clearTimer(), []);

  return (
    <Pressable
      onPressIn={startHold}
      onPressOut={endHold}
      style={{ alignItems: 'center', width: '100%' }}
    >
      <View
        style={{
          width: '100%',
          height: 56,
          borderWidth: 3,
          borderColor: accentHex,
          backgroundColor: '#000',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: accentHex,
              opacity: 0.4,
            },
            fillStyle,
          ]}
        />
        <View
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 11,
              letterSpacing: 1,
            }}
          >
            {label}
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#4A4A4A',
          fontSize: 7,
          marginTop: 6,
        }}
      >
        HOLD TO CONFIRM
      </Text>
    </Pressable>
  );
}
