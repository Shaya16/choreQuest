import { type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

type Color = 'yellow' | 'cyan' | 'pink' | 'red' | 'blue' | 'lime';

const BG: Record<Color, string> = {
  yellow: '#FFCC00',
  cyan: '#00DDFF',
  pink: '#FFB8DE',
  red: '#FF3333',
  blue: '#2121FF',
  lime: '#9EFA00',
};

export function PixelButton({
  onPress,
  color = 'yellow',
  disabled,
  children,
  style,
}: {
  onPress?: () => void;
  color?: Color;
  disabled?: boolean;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: '#000000',
            borderWidth: 2,
            borderColor: '#FFFFFF',
            padding: 2,
            transform: [{ translateY: pressed ? 2 : 0 }],
          }}
        >
          <View
            style={{
              backgroundColor: BG[color],
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderTopWidth: 2,
              borderLeftWidth: 2,
              borderTopColor: '#FFFFFF',
              borderLeftColor: '#FFFFFF',
              borderBottomWidth: 2,
              borderRightWidth: 2,
              borderBottomColor: '#4A4A4A',
              borderRightColor: '#4A4A4A',
            }}
          >
            {typeof children === 'string' ? (
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: color === 'blue' || color === 'red' ? '#FFFFFF' : '#000000',
                  fontSize: 10,
                  textAlign: 'center',
                }}
              >
                {children}
              </Text>
            ) : (
              children
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}
