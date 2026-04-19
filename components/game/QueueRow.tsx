import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { ShopItem } from '@/lib/types';

type RequestedProps = {
  variant: 'requested';
  purchaseId: string;
  item: ShopItem;
  requestedAt: string;
  partnerName: string;
  onDeliver: (purchaseId: string) => void;
};

type StockpiledProps = {
  variant: 'stockpiled';
  item: ShopItem;
  count: number;
  partnerName: string;
};

type Props = RequestedProps | StockpiledProps;

/**
 * One row in the target's QUEUE. Requested variant shows timestamp + big
 * DELIVERED button. Stockpiled variant is informational only (partner has
 * bought but hasn't called in yet).
 */
export function QueueRow(props: Props) {
  const { item } = props;
  return (
    <View
      style={{
        backgroundColor: '#000',
        borderWidth: 2,
        borderColor: props.variant === 'requested' ? '#FF3333' : '#4A4A4A',
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
          {props.variant === 'stockpiled' && props.count > 1
            ? `  ×${props.count}`
            : ''}
        </Text>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: props.variant === 'requested' ? '#FF3333' : '#4A4A4A',
            fontSize: 7,
            marginTop: 4,
          }}
        >
          {props.variant === 'requested'
            ? `${props.partnerName} called this in ${formatRelative(props.requestedAt)}`
            : `${props.partnerName} has these saved up · brace`}
        </Text>
      </View>
      {props.variant === 'requested' && (
        <Pressable
          onPress={() => {
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
            props.onDeliver(props.purchaseId);
          }}
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
            ✓ DELIVERED
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
