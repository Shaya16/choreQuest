import { useEffect, useState } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';

type Props = {
  /** Horizontal sprite sheet (frames laid out left-to-right, same size each). */
  sheet: ImageSourcePropType;
  /** Number of frames in the strip. */
  frameCount: number;
  /** Source-frame size in the sheet's native pixels. */
  sourceFrameWidth: number;
  sourceFrameHeight: number;
  /** Rendered size on screen. Aspect ratio is derived from the source frame. */
  displayWidth: number;
  /** Milliseconds per frame. 100–140 reads like classic arcade. */
  frameDurationMs?: number;
  /** 1 = facing right (default, matches sheet), -1 = flipped. */
  facingFlip?: 1 | -1;
  /** Pause on false (e.g. when knocked out, victory pose, etc.). */
  playing?: boolean;
};

/**
 * Renders one frame of a horizontal sprite sheet at a time and cycles through
 * them. Zero deps beyond RN — the sheet sits in a clipped window and we
 * translate it by one displayWidth per tick.
 *
 * Callers can nest this inside MotiView wrappers (bob / pace / lunge) — the
 * sprite animates its frames *in place* while the wrappers move the whole
 * thing around the stage. That combo is what gives you the "walking across
 * the screen" feel vs just a static sprite sliding.
 */
export function AnimatedSprite({
  sheet,
  frameCount,
  sourceFrameWidth,
  sourceFrameHeight,
  displayWidth,
  frameDurationMs = 120,
  facingFlip = 1,
  playing = true,
}: Props) {
  const [frame, setFrame] = useState(0);
  const [trackedSheet, setTrackedSheet] = useState(sheet);

  // Derived-state reset: when the sheet swaps (idle → walk on strike),
  // snap frame to 0 in the same render. Using an effect here leaves one
  // paint where a stale index from the old sheet clips the new strip
  // mid-frame, which reads as "two frames at once".
  if (sheet !== trackedSheet) {
    setTrackedSheet(sheet);
    setFrame(0);
  }

  useEffect(() => {
    if (!playing || frameCount <= 1) return;
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % frameCount);
    }, frameDurationMs);
    return () => clearInterval(id);
  }, [playing, frameCount, frameDurationMs]);

  const scale = displayWidth / sourceFrameWidth;
  const displayHeight = sourceFrameHeight * scale;

  return (
    <View
      style={{
        width: displayWidth,
        height: displayHeight,
        overflow: 'hidden',
        // Flipping the clip window mirrors the visible frame without
        // shifting which frame is in view (which would happen if we
        // flipped the inner strip instead).
        transform: [{ scaleX: facingFlip }],
      }}
    >
      <Image
        source={sheet}
        style={{
          width: displayWidth * frameCount,
          height: displayHeight,
          transform: [{ translateX: -frame * displayWidth }],
        }}
        resizeMode="stretch"
      />
    </View>
  );
}
