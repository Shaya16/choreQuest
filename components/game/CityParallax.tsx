import { Dimensions, Image, View } from 'react-native';
import { MotiView } from 'moti';

const FAR_SRC = require('@/assets/sprites/backgrounds/far_arcade.png');
const NEAR_SRC = require('@/assets/sprites/backgrounds/near_arcade.png');

// Source image native dimensions (from the generation spec).
const FAR_W = 512;
const FAR_H = 160;
const NEAR_W = 512;
const NEAR_H = 200;

function BackdropLayer({
  source,
  srcWidth,
  renderHeight,
  aspectRatio,
  durationMs,
  bottomOffset = 0,
}: {
  source: number;
  srcWidth: number;
  renderHeight: number;
  aspectRatio: number; // srcW/srcH
  durationMs: number;
  bottomOffset?: number;
}) {
  const { width: screenW } = Dimensions.get('window');
  const tileW = renderHeight * aspectRatio;
  // How many tiles we need to cover 2× the screen so we can scroll one full tile.
  const tiles = Math.ceil((screenW * 2) / tileW) + 1;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomOffset,
        height: renderHeight,
        overflow: 'hidden',
      }}
    >
      <MotiView
        from={{ translateX: 0 }}
        animate={{ translateX: -tileW }}
        transition={{
          type: 'timing',
          duration: durationMs,
          loop: true,
          // Without this, Moti ping-pongs: after one tile-width of left drift
          // it slides back right, so the parallax appears to "stop" and
          // reverse. Seamless infinite scroll needs a hard reset to 0.
          repeatReverse: false,
        }}
        style={{
          flexDirection: 'row',
          height: renderHeight,
        }}
      >
        {Array.from({ length: tiles }).map((_, i) => (
          <Image
            key={i}
            source={source}
            style={{
              width: tileW,
              height: renderHeight,
            }}
            resizeMode="stretch"
          />
        ))}
      </MotiView>
    </View>
  );
}

export function CityParallax({
  height,
  accentHex: _accentHex,
}: {
  height: number;
  accentHex: string;
}) {
  const farH = Math.min(height - 20, 160);
  const nearH = Math.min(height, 200);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height,
      }}
    >
      <BackdropLayer
        source={FAR_SRC}
        srcWidth={FAR_W}
        renderHeight={farH}
        aspectRatio={FAR_W / FAR_H}
        durationMs={70000}
        bottomOffset={12}
      />
      <BackdropLayer
        source={NEAR_SRC}
        srcWidth={NEAR_W}
        renderHeight={nearH}
        aspectRatio={NEAR_W / NEAR_H}
        durationMs={28000}
        bottomOffset={0}
      />
    </View>
  );
}
