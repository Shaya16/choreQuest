import { View } from 'react-native';

/**
 * Small absolute-positioned red dot. Drop inside a positioned parent
 * (e.g. an ActionTile wrapper with position: 'relative') and it floats
 * at the top-right corner. Use to signal unread / pending-attention state.
 */
export function RedDotBadge({
  size = 12,
  color = '#FF3333',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -4,
        right: -4,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: '#000',
      }}
    />
  );
}
