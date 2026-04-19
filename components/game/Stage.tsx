import { type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { CityParallax } from './CityParallax';
import { GroundTiles } from './GroundTiles';
import { Starfield } from './Starfield';

type Props = {
  accentHex: string;
  height?: number | string;
  children: ReactNode;
  style?: ViewStyle;
  showStars?: boolean;
  showCity?: boolean;
  showGround?: boolean;
};

/**
 * Layered arcade scene: starfield → parallax city → ground tiles → children.
 * Children render on top of everything (character sprite, HUD chips, etc.)
 * and are positioned absolutely inside a box that sits above the ground line.
 */
export function Stage({
  accentHex,
  height = 360,
  children,
  style,
  showStars = true,
  showCity = true,
  showGround = true,
}: Props) {
  const h = typeof height === 'number' ? height : 360;

  return (
    <View
      style={[
        {
          width: '100%',
          height: h,
          overflow: 'hidden',
          backgroundColor: '#000000',
          borderWidth: 3,
          borderColor: accentHex,
          position: 'relative',
        },
        style,
      ]}
    >
      {showStars && <Starfield count={25} />}
      {showCity && <CityParallax height={h - 24} accentHex={accentHex} />}

      {showGround && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <GroundTiles accentHex={accentHex} />
        </View>
      )}

      <View
        style={{
          position: 'absolute',
          bottom: showGround ? 24 : 0,
          left: 0,
          right: 0,
          top: 0,
        }}
      >
        {children}
      </View>
    </View>
  );
}
