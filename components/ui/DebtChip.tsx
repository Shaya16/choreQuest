// components/ui/DebtChip.tsx — red "🔒 IN DEBT · 50% COINS" chip.
// Renders for a player with ≥ 1 active debt (>24h). Tappable.

import { Pressable, Text } from 'react-native';

export type DebtChipProps = {
  onPress?: () => void;
};

export function DebtChip({ onPress }: DebtChipProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        paddingHorizontal: 6,
        paddingVertical: 3,
        backgroundColor: '#FF3333',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        borderRadius: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 8, color: '#FFFFFF' }}>🔒</Text>
      <Text
        style={{
          fontFamily: 'PressStart2P',
          fontSize: 7,
          color: '#FFFFFF',
          letterSpacing: 1,
        }}
      >
        IN DEBT · 50% COINS
      </Text>
    </Pressable>
  );
}
