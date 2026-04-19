import { Asset } from 'expo-asset';

// Every bundled image the first post-boot screens reach for. Keep in sync with
// characters.ts + CityParallax.tsx so BootScreen can cover the decode cost.
// require() returns an opaque module id that Asset.loadAsync + <Image> both accept.
export const PRELOAD_IMAGES: number[] = [
  require('@/assets/sprites/backgrounds/far_arcade.png'),
  require('@/assets/sprites/backgrounds/near_arcade.png'),
  require('@/assets/sprites/characters/gym_fighter.png'),
  require('@/assets/sprites/characters/vibe_queen.png'),
  require('@/assets/sprites/characters/sweepman.png'),
  require('@/assets/sprites/characters/chef_kong.png'),
  require('@/assets/sprites/characters/nerd_tron.png'),
  require('@/assets/sprites/characters/shay.png'),
  require('@/assets/sprites/characters/kessy.png'),
];

/**
 * Resolve every bundled image so the first <Image> mount doesn't stall on
 * metadata fetch. BootScreen also renders these off-screen to force a GPU
 * decode pass — this function handles the resolve half.
 */
export async function preloadAssets(): Promise<void> {
  await Asset.loadAsync(PRELOAD_IMAGES);
}
