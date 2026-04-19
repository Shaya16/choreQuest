import { Text, View } from 'react-native';

type Props = {
  label: string;
  value: number; // 0..10
  color: string; // hex
  total?: number;
};

export function StatBar({ label, value, color, total = 10 }: Props) {
  const clamped = Math.max(0, Math.min(total, Math.round(value)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#FFFFFF',
          fontSize: 8,
          width: 56,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 10,
              height: 10,
              marginRight: 2,
              backgroundColor: i < clamped ? color : '#4A4A4A',
              borderWidth: 1,
              borderColor: '#000000',
            }}
          />
        ))}
      </View>
    </View>
  );
}
