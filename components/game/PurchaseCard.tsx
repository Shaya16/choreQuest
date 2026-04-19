import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';

import { accentForCategory, formatCoins, tierForCost } from '@/lib/shop-format';
import type { ShopItem } from '@/lib/types';

type Props = {
  item: ShopItem;
  width: number; // computed by parent (screen width / 2 - margins)
  affordable: boolean;
  disabledReason: 'afford' | 'partner' | null;
  shortfall: number; // coins needed beyond what player has; 0 if affordable
  onPress: (item: ShopItem) => void;
};

/**
 * One catalog item card. Category accent on the top shelf and price-tag
 * footer; cost-tier border weight; locked variant shows the delta to
 * unlock so unaffordable items remain motivating, not just dimmed.
 */
export function PurchaseCard({
  item,
  width,
  affordable,
  disabledReason,
  shortfall,
  onPress,
}: Props) {
  const accent = accentForCategory(item.category);
  const tier = tierForCost(item.cost);
  const borderWidth = tier === 'standard' ? 2 : tier === 'mid' ? 3 : 4;
  const isPartnerLocked = disabledReason === 'partner';
  const isAffordLocked = disabledReason === 'afford';
  const locked = !affordable;

  // Color choices for locked vs. unlocked
  const shelfColor = locked ? '#4A4A4A' : accent;
  const footerBg = locked ? '#4A4A4A' : accent;
  const footerText = locked ? '#FFFFFF' : '#000000';

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(
          locked
            ? Haptics.ImpactFeedbackStyle.Rigid
            : Haptics.ImpactFeedbackStyle.Medium
        );
        onPress(item);
      }}
      style={{
        width,
        height: 168,
        backgroundColor: '#000',
        borderWidth,
        borderColor: locked ? '#4A4A4A' : accent,
        opacity: isPartnerLocked ? 0.5 : 1,
      }}
    >
      {/* Top shelf band */}
      <View style={{ height: 8, backgroundColor: shelfColor }} />

      {/* Premium corner stars */}
      {tier === 'premium' && !locked && (
        <>
          <Text
            style={{
              position: 'absolute',
              top: 12,
              left: 6,
              fontFamily: 'PressStart2P',
              fontSize: 10,
              color: accent,
            }}
          >
            ✦
          </Text>
          <Text
            style={{
              position: 'absolute',
              top: 12,
              right: 6,
              fontFamily: 'PressStart2P',
              fontSize: 10,
              color: accent,
            }}
          >
            ✦
          </Text>
        </>
      )}

      {/* Body: emoji + name */}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 6,
          paddingVertical: 8,
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 48 }}>{extractIcon(item.name)}</Text>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 8,
            textAlign: 'center',
            lineHeight: 12,
          }}
        >
          {stripIcon(item.name).toUpperCase()}
        </Text>
      </View>

      {/* Price-tag footer */}
      <MotiView
        from={{ opacity: 1 }}
        animate={{ opacity: locked ? 1 : 0.85 }}
        transition={
          locked
            ? { type: 'timing', duration: 0 }
            : {
                type: 'timing',
                duration: 2000,
                loop: true,
                repeatReverse: true,
              }
        }
        style={{
          backgroundColor: footerBg,
          paddingVertical: 6,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: footerText,
            fontSize: 10,
          }}
        >
          {isPartnerLocked
            ? '🔒 NO PARTNER'
            : isAffordLocked
              ? `🔒 NEED +${shortfall}¢`
              : formatCoins(item.cost)}
        </Text>
      </MotiView>
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
