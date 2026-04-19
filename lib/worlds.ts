import type { Player, World } from './types';

export const WORLD_ORDER: World[] = [
  'gym',
  'aerobics',
  'university',
  'diet',
  'household',
  'reading',
];

type WorldMeta = {
  label: string;
  shortLabel: string;
  emoji: string;
  accentHex: string;
  multKey: keyof Player;
};

export const WORLD_META: Record<World, WorldMeta> = {
  gym: {
    label: 'GYM',
    shortLabel: 'GYM',
    emoji: '💪',
    accentHex: '#FF3333',
    multKey: 'mult_gym',
  },
  aerobics: {
    label: 'AEROBICS',
    shortLabel: 'CARDIO',
    emoji: '🏃',
    accentHex: '#FFB8DE',
    multKey: 'mult_aerobics',
  },
  university: {
    label: 'UNIVERSITY',
    shortLabel: 'BRAIN',
    emoji: '🎓',
    accentHex: '#9EFA00',
    multKey: 'mult_university',
  },
  diet: {
    label: 'DIET',
    shortLabel: 'FUEL',
    emoji: '🥗',
    accentHex: '#FFA63F',
    multKey: 'mult_diet',
  },
  household: {
    label: 'HOUSEHOLD',
    shortLabel: 'HOUSE',
    emoji: '🧹',
    accentHex: '#2121FF',
    multKey: 'mult_household',
  },
  reading: {
    label: 'READING',
    shortLabel: 'READ',
    emoji: '📖',
    accentHex: '#00DDFF',
    multKey: 'mult_reading',
  },
};
