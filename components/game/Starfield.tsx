import { useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import { MotiView } from 'moti';

type Star = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
};

const COLORS = ['#FFFFFF', '#00DDFF', '#FFB8DE', '#FFCC00'];

export function Starfield({ count = 40 }: { count?: number }) {
  const { width, height } = Dimensions.get('window');
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() < 0.2 ? 3 : Math.random() < 0.5 ? 2 : 1,
        duration: 3500 + Math.random() * 4500,
        delay: Math.random() * 3000,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      })),
    [count, width, height]
  );

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0 }}
    >
      {stars.map((s) => (
        <MotiView
          key={s.id}
          from={{ translateY: -8, opacity: 0 }}
          animate={{ translateY: height + 8, opacity: 1 }}
          transition={{
            type: 'timing',
            duration: s.duration,
            delay: s.delay,
            loop: true,
            repeatReverse: false,
          }}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            backgroundColor: s.color,
          }}
        />
      ))}
    </View>
  );
}
