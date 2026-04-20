import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';

import type { ShopItem } from '@/lib/types';

type PendingStackProps = {
  variant: 'pending';
  item: ShopItem;
  count: number;
  onRedeem: (item: ShopItem) => void;
};

type AwaitingProps = {
  variant: 'awaiting';
  item: ShopItem;
};

type Props = PendingStackProps | AwaitingProps;

/**
 * Buyer's arsenal row. Pending = deployable cartridge with ammo badge and
 * pulsing DEPLOY button. Awaiting = no action, slow border pulse so the
 * row feels live (waiting on partner). Parent owns the confirm modal.
 */
export function ArsenalRow(props: Props) {
  const { item } = props;
  const isPending = props.variant === 'pending';
  return (
    <MotiView
      from={{ opacity: 1 }}
      animate={{ opacity: isPending ? 1 : 0.7 }}
      transition={
        isPending
          ? { type: 'timing', duration: 0 }
          : {
              type: 'timing',
              duration: 1800,
              loop: true,
              repeatReverse: true,
            }
      }
      style={{
        backgroundColor: '#000',
        borderWidth: 2,
        borderColor: isPending ? '#9EFA00' : '#FFCC00',
        marginBottom: 8,
        position: 'relative',
        minHeight: 96,
      }}
    >
      {/* Ammo badge */}
      {isPending && props.count > 1 && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            backgroundColor: '#9EFA00',
            paddingHorizontal: 8,
            paddingVertical: 4,
            zIndex: 5,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#000',
              fontSize: 9,
            }}
          >
            ×{props.count}
          </Text>
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 32 }}>{extractIcon(item.name)}</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 9,
              lineHeight: 14,
            }}
          >
            {stripIcon(item.name).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: isPending ? '#4A4A4A' : '#FFCC00',
              fontSize: 7,
              marginTop: 4,
            }}
          >
            {isPending
              ? `${item.cost}¢ EACH`
              : '⏳ AWAITING DELIVERY'}
          </Text>
        </View>
      </View>

      {isPending && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <MotiView
            from={{ scale: 1 }}
            animate={{ scale: 1.03 }}
            transition={{
              type: 'timing',
              duration: 1500,
              loop: true,
              repeatReverse: true,
            }}
          >
            <Pressable
              onPress={() => props.onRedeem(item)}
              style={{
                backgroundColor: '#9EFA00',
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#000',
                  fontSize: 9,
                  letterSpacing: 1,
                }}
              >
                ▶ DEPLOY
              </Text>
            </Pressable>
          </MotiView>
        </View>
      )}
    </MotiView>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
