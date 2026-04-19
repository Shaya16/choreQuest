import type { ImageSourcePropType } from 'react-native';
import type { ArcadeClass } from './types';

export const CLASS_ORDER: ArcadeClass[] = [
  'gym_fighter',
  'vibe_queen',
  'sweepman',
  'chef_kong',
  'nerd_tron',
  'shay',
  'kessy',
];

export type AccentKey =
  | 'red'
  | 'pink'
  | 'blue'
  | 'orange'
  | 'lime'
  | 'yellow'
  | 'cyan';

export const ACCENT_HEX: Record<AccentKey, string> = {
  red: '#FF3333',
  pink: '#FFB8DE',
  blue: '#2121FF',
  orange: '#FFA63F',
  lime: '#9EFA00',
  yellow: '#FFCC00',
  cyan: '#00DDFF',
};

/**
 * Sprite sheets are optional — drop them in as you generate them in nano
 * banana. If a sheet is missing, rendering falls back to the static `sprite`.
 * Sheets are horizontal strips of equal-size frames. Defaults match the
 * generation prompt (256×256 source, 6 walk / 4 idle / 3 attack frames).
 */
export type SpriteSheet = {
  source: ImageSourcePropType;
  frames: number;
  /** Source frame size in native pixels (not render size). */
  frameW?: number;
  frameH?: number;
  /** ms per frame. Walks 100–140, idles 200–260, attacks 70–90. */
  durationMs?: number;
};

type ClassMeta = {
  label: string;
  blurb: string;
  accent: AccentKey;
  sprite: ImageSourcePropType;
  stats: { pwr: number; spd: number; brn: number; chr: number };
  /** Walk cycle — used in the arena when this character is on screen idle-pacing. */
  walkSheet?: SpriteSheet;
  /** Idle/breathing cycle — used in character select and still-frames. */
  idleSheet?: SpriteSheet;
  /** Attack cycle — played on strike (currently unused; scaffolded for later). */
  attackSheet?: SpriteSheet;
};

export const DEFAULT_SHEET_FRAME_W = 256;
export const DEFAULT_SHEET_FRAME_H = 256;

export const CLASS_META: Record<ArcadeClass, ClassMeta> = {
  gym_fighter: {
    label: 'GYM FIGHTER',
    blurb: 'Powers lifts and cardio.',
    accent: 'red',
    sprite: require('@/assets/sprites/characters/gym_fighter.png'),
    stats: { pwr: 9, spd: 6, brn: 3, chr: 5 },
  },
  vibe_queen: {
    label: 'VIBE QUEEN',
    blurb: 'Aerobics + reading flow.',
    accent: 'pink',
    sprite: require('@/assets/sprites/characters/vibe_queen.png'),
    stats: { pwr: 4, spd: 9, brn: 6, chr: 10 },
  },
  sweepman: {
    label: 'SWEEPMAN',
    blurb: 'Household tier specialist.',
    accent: 'blue',
    sprite: require('@/assets/sprites/characters/sweepman.png'),
    stats: { pwr: 7, spd: 7, brn: 5, chr: 6 },
  },
  chef_kong: {
    label: 'CHEF KONG',
    blurb: 'Diet + meal planning.',
    accent: 'orange',
    sprite: require('@/assets/sprites/characters/chef_kong.png'),
    stats: { pwr: 6, spd: 4, brn: 7, chr: 9 },
  },
  nerd_tron: {
    label: 'NERD TRON',
    blurb: 'University focus.',
    accent: 'lime',
    sprite: require('@/assets/sprites/characters/nerd_tron.png'),
    stats: { pwr: 3, spd: 5, brn: 10, chr: 4 },
  },
  shay: {
    label: 'SHAY',
    blurb: 'P1 — the real-life protagonist.',
    accent: 'yellow',
    sprite: require('@/assets/sprites/characters/shay.png'),
    stats: { pwr: 7, spd: 7, brn: 7, chr: 7 },
    walkSheet: {
      source: require('@/assets/sprites/characters/shay_walk.png'),
      frames: 6,
      frameW: 4096 / 6,
      frameH: 670,
      durationMs: 120,
    },
    idleSheet: {
      source: require('@/assets/sprites/characters/shay_idle.png'),
      frames: 4,
      frameW: 1536 / 4,
      frameH: 381,
      durationMs: 220,
    },
    attackSheet: {
      source: require('@/assets/sprites/characters/shay_attack.png'),
      frames: 3,
      frameW: 3584 / 3,
      frameH: 1184,
      // 150ms/frame so each static AI-generated pose actually reads:
      // wind-up (150ms), impact (150ms), recoil (150ms) = 450ms total.
      durationMs: 150,
    },
  },
  kessy: {
    label: 'KESSY',
    blurb: 'P2 — the real-life co-star.',
    accent: 'cyan',
    sprite: require('@/assets/sprites/characters/kessy.png'),
    stats: { pwr: 7, spd: 7, brn: 7, chr: 7 },
    walkSheet: {
      source: require('@/assets/sprites/characters/kessy_walk.png'),
      frames: 6,
      frameW: 4096 / 6,
      frameH: 670,
      durationMs: 120,
    },
    idleSheet: {
      source: require('@/assets/sprites/characters/kessy_idle.png'),
      frames: 4,
      frameW: 1536 / 4,
      frameH: 381,
      durationMs: 220,
    },
    attackSheet: {
      source: require('@/assets/sprites/characters/kessy_attack.png'),
      frames: 3,
      frameW: 3584 / 3,
      frameH: 1184,
      durationMs: 150,
    },
  },
};
