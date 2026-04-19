import { Pressable, Text, View } from 'react-native';

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
 * One row in the buyer's ARSENAL. Pending variant shows the stack count and
 * a REDEEM button; awaiting variant shows "AWAITING DELIVERY" with no
 * action (waiting on partner). Parent owns the confirm modal for REDEEM.
 */
export function ArsenalRow(props: Props) {
  const { item } = props;
  return (
    <View
      style={{
        backgroundColor: '#000',
        borderWidth: 2,
        borderColor: props.variant === 'pending' ? '#9EFA00' : '#FFCC00',
        padding: 12,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 28, marginRight: 12 }}>{extractIcon(item.name)}</Text>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 9,
          }}
        >
          {stripIcon(item.name).toUpperCase()}
          {props.variant === 'pending' && props.count > 1
            ? `  ×${props.count}`
            : ''}
        </Text>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: props.variant === 'pending' ? '#4A4A4A' : '#FFCC00',
            fontSize: 7,
            marginTop: 4,
          }}
        >
          {props.variant === 'pending'
            ? `${item.cost}¢ each · tap to redeem`
            : '⏳ AWAITING DELIVERY'}
        </Text>
      </View>
      {props.variant === 'pending' && (
        <Pressable
          onPress={() => props.onRedeem(item)}
          style={{
            borderWidth: 2,
            borderColor: '#9EFA00',
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#9EFA00',
              fontSize: 8,
            }}
          >
            ▶ REDEEM
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
