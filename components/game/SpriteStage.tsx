import { Image, type ImageSourcePropType, View } from 'react-native';
import { MotiView } from 'moti';

type Props = {
  sprite: ImageSourcePropType;
  accentHex: string;
  size?: number;
};

export function SpriteStage({ sprite, accentHex, size = 200 }: Props) {
  const pedestalW = size * 0.9;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
      <MotiView
        from={{ translateY: 0 }}
        animate={{ translateY: -6 }}
        transition={{
          type: 'timing',
          duration: 900,
          loop: true,
          repeatReverse: true,
        }}
        style={{ zIndex: 2 }}
      >
        <Image
          source={sprite}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </MotiView>

      <MotiView
        from={{ scaleX: 1, opacity: 0.6 }}
        animate={{ scaleX: 0.8, opacity: 1 }}
        transition={{
          type: 'timing',
          duration: 900,
          loop: true,
          repeatReverse: true,
        }}
        style={{
          position: 'absolute',
          bottom: 6,
          width: pedestalW * 0.8,
          height: 6,
          backgroundColor: accentHex,
          opacity: 0.6,
          borderRadius: 0,
          zIndex: 0,
        }}
      />

      <View
        style={{
          width: pedestalW,
          height: 20,
          backgroundColor: '#000000',
          borderTopWidth: 4,
          borderTopColor: accentHex,
          borderLeftWidth: 2,
          borderRightWidth: 2,
          borderLeftColor: '#FFFFFF',
          borderRightColor: '#FFFFFF',
          zIndex: 1,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                borderRightWidth: 1,
                borderRightColor: accentHex,
                opacity: 0.4,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
