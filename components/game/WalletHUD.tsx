import { Text, View } from 'react-native';

type Props = {
  coins: number;
  tokenCount: number;
  awaitingCount: number;
};

/**
 * Sticky top header on the Shop screen. Big spendable balance + ambient
 * inventory counts. Pure presentational — parent feeds it numbers.
 */
export function WalletHUD({ coins, tokenCount, awaitingCount }: Props) {
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
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#FFCC00',
          fontSize: 20,
          letterSpacing: 1,
        }}
      >
        💰 {coins.toLocaleString()}¢
      </Text>
      {(tokenCount > 0 || awaitingCount > 0) && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#4A4A4A',
            fontSize: 7,
            marginTop: 6,
          }}
        >
          📦 {tokenCount} TOKEN{tokenCount === 1 ? '' : 'S'}
          {awaitingCount > 0 ? ` · ${awaitingCount} AWAITING DELIVERY` : ''}
        </Text>
      )}
    </View>
  );
}
