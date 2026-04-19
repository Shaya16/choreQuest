import { type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

type Accent =
  | 'white'
  | 'yellow'
  | 'cyan'
  | 'pink'
  | 'red'
  | 'blue'
  | 'lime'
  | 'orange'
  | 'gray';

const ACCENT_HEX: Record<Accent, string> = {
  white: '#FFFFFF',
  yellow: '#FFCC00',
  cyan: '#00DDFF',
  pink: '#FFB8DE',
  red: '#FF3333',
  blue: '#2121FF',
  lime: '#9EFA00',
  orange: '#FFA63F',
  gray: '#4A4A4A',
};

export function PixelFrame({
  children,
  accent = 'white',
  fill = '#000000',
  style,
}: {
  children: ReactNode;
  accent?: Accent;
  fill?: string;
  style?: ViewStyle;
}) {
  const color = ACCENT_HEX[accent];
  return (
    <View
      style={[
        {
          backgroundColor: '#000000',
          padding: 2,
        },
        style,
      ]}
    >
      <View style={{ backgroundColor: color, padding: 2 }}>
        <View style={{ backgroundColor: '#000000', padding: 2 }}>
          <View style={{ backgroundColor: color, padding: 2 }}>
            <View style={{ backgroundColor: fill }}>{children}</View>
          </View>
        </View>
      </View>
    </View>
  );
}
