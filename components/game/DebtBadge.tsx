import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  variant: 'owes' | 'collects';
  itemIcon: string; // single emoji or short string
  itemLabel?: string;
};

/**
 * Visual debt indicator placed above a fighter on the home Stage.
 *  - 'owes' → wraps the fighter in a chain badge + floats item icon above.
 *  - 'collects' → floats item icon above the (loser) fighter on the winner's
 *    arena, with a small CROWN beside.
 */
export function DebtBadge({ variant, itemIcon, itemLabel }: Props) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 700 }),
        withTiming(0, { duration: 700 })
      ),
      -1,
      false
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -42,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <Animated.View style={floatStyle}>
        <Text style={{ fontSize: 22 }}>{itemIcon}</Text>
      </Animated.View>
      {variant === 'owes' && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FF3333',
            fontSize: 6,
            marginTop: 4,
          }}
        >
          🔗 OWED
        </Text>
      )}
      {variant === 'collects' && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 6,
            marginTop: 4,
          }}
        >
          👑 COLLECT
        </Text>
      )}
      {itemLabel && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 6,
            marginTop: 2,
            maxWidth: 120,
            textAlign: 'center',
          }}
          numberOfLines={2}
        >
          {itemLabel.toUpperCase()}
        </Text>
      )}
    </View>
  );
}
