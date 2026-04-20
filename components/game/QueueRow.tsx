import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';
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
 * Target's queue row. Requested = high-prominence with blinking red dot and
 * heavy DELIVER NOW button. Stockpiled = ambient gray with no motion.
 */
export function QueueRow(props: Props) {
  const { item } = props;
  const isRequested = props.variant === 'requested';
  return (
    <View
      style={{
        backgroundColor: '#000',
        borderWidth: isRequested ? 3 : 2,
        borderColor: isRequested ? '#FF3333' : '#4A4A4A',
        marginBottom: 8,
        position: 'relative',
        padding: 12,
      }}
    >
      {/* Blinking red dot for incoming */}
      {isRequested && (
        <MotiView
          from={{ opacity: 1 }}
          animate={{ opacity: 0.2 }}
          transition={{
            type: 'timing',
            duration: 500,
            loop: true,
            repeatReverse: true,
          }}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: '#FF3333',
            zIndex: 5,
          }}
        />
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginLeft: isRequested ? 14 : 0,
        }}
      >
        <Text style={{ fontSize: 28 }}>{extractIcon(item.name)}</Text>
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
            {!isRequested && props.count > 1 ? `  ×${props.count}` : ''}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: isRequested ? '#FF3333' : '#4A4A4A',
              fontSize: 7,
              marginTop: 4,
            }}
          >
            {isRequested
              ? `${props.partnerName} called this in ${formatRelative(props.requestedAt)}`
              : `${props.partnerName} HAS THESE SAVED · BRACE`}
          </Text>
        </View>
      </View>

      {isRequested && (
        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={() => {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
              props.onDeliver(props.purchaseId);
            }}
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
              ✓ DELIVER NOW
            </Text>
          </Pressable>
        </View>
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
