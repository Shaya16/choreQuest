import { Dimensions, View } from 'react-native';
import { MotiView } from 'moti';

export function GroundTiles({
  accentHex,
  tileSize = 24,
  speedMs = 3500,
}: {
  accentHex: string;
  tileSize?: number;
  speedMs?: number;
}) {
  const { width } = Dimensions.get('window');
  const tiles = Math.ceil((width * 2) / tileSize) + 2;

  return (
    <View
      pointerEvents="none"
      style={{
        height: tileSize,
        overflow: 'hidden',
        borderTopWidth: 3,
        borderTopColor: accentHex,
        borderBottomWidth: 3,
        borderBottomColor: '#FFFFFF',
        backgroundColor: '#000000',
      }}
    >
      <MotiView
        from={{ translateX: 0 }}
        animate={{ translateX: -tileSize * 2 }}
        transition={{
          type: 'timing',
          duration: speedMs,
          loop: true,
          // Reset to 0 after two tiles instead of ping-ponging back —
          // otherwise the ground "stops" and reverses every speedMs.
          repeatReverse: false,
        }}
        style={{
          flexDirection: 'row',
          height: tileSize,
        }}
      >
        {Array.from({ length: tiles }).map((_, i) => (
          <View
            key={i}
            style={{
              width: tileSize,
              height: tileSize,
              backgroundColor: i % 2 === 0 ? '#000000' : '#0a0a0a',
              borderRightWidth: 1,
              borderRightColor: accentHex,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 4,
                height: 4,
                backgroundColor: i % 2 === 0 ? accentHex : 'transparent',
                opacity: 0.5,
              }}
            />
          </View>
        ))}
      </MotiView>
    </View>
  );
}
