import type { ImageSourcePropType } from 'react-native';

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
  iconSprite: ImageSourcePropType;
  accentHex: string;
  multKey: keyof Player;
};

export const WORLD_META: Record<World, WorldMeta> = {
  gym: {
    label: 'GYM',
    shortLabel: 'GYM',
    emoji: '💪',
    iconSprite: require('../assets/sprites/worlds/gym.png'),
    accentHex: '#FF3333',
    multKey: 'mult_gym',
  },
  aerobics: {
    label: 'AEROBICS',
    shortLabel: 'CARDIO',
    emoji: '🏃',
    iconSprite: require('../assets/sprites/worlds/aerobics.png'),
    accentHex: '#FFB8DE',
    multKey: 'mult_aerobics',
  },
  university: {
    label: 'UNIVERSITY',
    shortLabel: 'BRAIN',
    emoji: '🎓',
    iconSprite: require('../assets/sprites/worlds/university.png'),
    accentHex: '#9EFA00',
    multKey: 'mult_university',
  },
  diet: {
    label: 'DIET',
    shortLabel: 'FUEL',
    emoji: '🥗',
    iconSprite: require('../assets/sprites/worlds/diet.png'),
    accentHex: '#FFA63F',
    multKey: 'mult_diet',
  },
  household: {
    label: 'HOUSEHOLD',
    shortLabel: 'HOUSE',
    emoji: '🧹',
    iconSprite: require('../assets/sprites/worlds/household.png'),
    accentHex: '#2121FF',
    multKey: 'mult_household',
  },
  reading: {
    label: 'READING',
    shortLabel: 'READ',
    emoji: '📖',
    iconSprite: require('../assets/sprites/worlds/reading.png'),
    accentHex: '#00DDFF',
    multKey: 'mult_reading',
  },
};

export const COIN_SPRITE: ImageSourcePropType = require('../assets/sprites/worlds/coin.png');
