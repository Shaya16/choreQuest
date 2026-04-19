import { useEffect, useRef, useState } from 'react';

/**
 * Animates a displayed integer from its current value up (or down) to `target`
 * over `durationMs`. If `target` changes mid-animation, the next tween starts
 * from whatever integer is currently on screen — so two strikes in quick
 * succession roll continuously instead of snapping back.
 */
export function useCountUp(target: number, durationMs: number = 450): number {
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  displayedRef.current = displayed;

  useEffect(() => {
    const from = displayedRef.current;
    if (from === target) return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 2); // ease-out quad
      setDisplayed(Math.round(from + (target - from) * eased));
      if (t >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [target, durationMs]);

  return displayed;
}
