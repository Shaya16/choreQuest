import { Text, View } from 'react-native';

type Props = {
  line: string;
};

/**
 * Persona panel under the WalletHUD. Anchors the screen as a destination
 * (a place with a vendor) rather than a tab (a list of buttons). Pure
 * presentational — parent picks the line via pickShopkeepLine.
 */
export function Shopkeep({ line }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 32 }}>🛍️</Text>
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
          borderWidth: 2,
          borderColor: '#4A4A4A',
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 8,
            lineHeight: 12,
          }}
        >
          "{line}"
        </Text>
      </View>
    </View>
  );
}
