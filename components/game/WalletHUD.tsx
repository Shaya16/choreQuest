import { Text, View } from 'react-native';
import { MotiView } from 'moti';

import { useCountUp } from '@/lib/useCountUp';
import { formatCoins } from '@/lib/shop-format';

type Props = {
  coins: number;
  tokenCount: number;
  awaitingCount: number;
  inDebt?: boolean;
};

/**
 * Top-of-shop "arcade register" panel. The coin number ticks via useCountUp
 * on prop change, and the inset display has a slow opacity pulse so the
 * register feels alive. Token count chip floats to the right.
 */
export function WalletHUD({ coins, tokenCount, awaitingCount, inDebt }: Props) {
  const displayed = useCountUp(coins, 500);
  return (
    <View
      style={{
        backgroundColor: '#000',
        borderBottomWidth: 2,
        borderBottomColor: '#FFCC00',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Inset register display */}
        <MotiView
          from={{ opacity: 1 }}
          animate={{ opacity: 0.7 }}
          transition={{
            type: 'timing',
            duration: 2000,
            loop: true,
            repeatReverse: true,
          }}
          style={{
            borderWidth: 4,
            borderColor: '#FFCC00',
            padding: 4,
            flexShrink: 1,
          }}
        >
          <View
            style={{
              borderWidth: 2,
              borderColor: '#FFCC00',
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {inDebt && (
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  fontSize: 10,
                  color: '#FF3333',
                  marginRight: 4,
                }}
              >
                🔗
              </Text>
            )}
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFCC00',
                fontSize: 18,
                letterSpacing: 1,
              }}
            >
              {formatCoins(displayed)}
            </Text>
          </View>
        </MotiView>

        {/* Token count chip */}
        {tokenCount > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginLeft: 12,
            }}
          >
            <Text style={{ fontSize: 18 }}>📦</Text>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFFFFF',
                fontSize: 11,
              }}
            >
              ×{tokenCount}
            </Text>
          </View>
        )}
      </View>

      {(tokenCount > 0 || awaitingCount > 0) && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: awaitingCount > 0 ? '#9EFA00' : '#4A4A4A',
            fontSize: 8,
            marginTop: 8,
            letterSpacing: 1,
          }}
        >
          {tokenCount} TOKEN{tokenCount === 1 ? '' : 'S'}
          {awaitingCount > 0 ? ` · ${awaitingCount} AWAITING DELIVERY` : ''}
        </Text>
      )}
    </View>
  );
}
