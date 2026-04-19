import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { ShopItem } from '@/lib/types';

type Props = {
  item: ShopItem;
  affordable: boolean;
  disabledReason: 'afford' | 'partner' | null;
  onPress: (item: ShopItem) => void;
};

/**
 * One catalog tile. Affordable → crisp, tappable. Unaffordable or
 * partnerless → dimmed, tap surfaces the reason via an alert in the parent
 * (we just haptic-buzz here). No purchase modal is shown from this card;
 * the parent owns the confirm flow.
 */
export function PurchaseCard({ item, affordable, disabledReason, onPress }: Props) {
  const disabled = !affordable || disabledReason === 'partner';
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(
          disabled
            ? Haptics.ImpactFeedbackStyle.Rigid
            : Haptics.ImpactFeedbackStyle.Medium
        );
        onPress(item);
      }}
      style={{
        width: 108,
        height: 144,
        backgroundColor: '#000',
        borderWidth: 3,
        borderColor: '#FFCC00',
        padding: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 30 }}>{extractIcon(item.name)}</Text>
      <Text
        numberOfLines={3}
        style={{
          fontFamily: 'PressStart2P',
          color: '#FFFFFF',
          fontSize: 7,
          textAlign: 'center',
        }}
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
