import { Text, View } from 'react-native';
import { MotiView } from 'moti';

export type DebtVariant = 'owes' | 'collects';

export function debtAccent(variant: DebtVariant): string {
  return variant === 'owes' ? '#FF3333' : '#FFCC00';
}

export function DebtFloor({ variant }: { variant: DebtVariant }) {
  return (
    <MotiView
      pointerEvents="none"
      from={{ opacity: 0.35, scaleX: 0.85 }}
      animate={{ opacity: 0.7, scaleX: 1.1 }}
      transition={{
        type: 'timing',
        duration: 1100,
        loop: true,
        repeatReverse: true,
      }}
      style={{
        position: 'absolute',
        bottom: 0,
        width: 120,
        height: 18,
        borderRadius: 999,
        backgroundColor: debtAccent(variant),
      }}
    />
  );
}

export function DebtCaption({
  variant,
  itemName,
}: {
  variant: DebtVariant;
  itemName: string;
}) {
  const color = variant === 'owes' ? '#FF3333' : '#FFCC00';
  const verb = variant === 'owes' ? 'YOU OWE' : 'OWES YOU';
  return (
    <Text
      style={{
        fontFamily: 'PressStart2P',
        color,
        fontSize: 9,
        letterSpacing: 1,
        textAlign: 'center',
        maxWidth: 140,
      }}
      numberOfLines={2}
    >
      {verb} {itemName.toUpperCase()}
    </Text>
  );
}
