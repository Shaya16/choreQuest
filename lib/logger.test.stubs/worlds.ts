// Stub — mirrors WORLD_META's multKey fields only (what computeLogValues reads).
// The real lib/worlds.ts pulls React Native / image assets via require(),
// which Deno can't load. This stub provides just what computeLogValues needs.
import type { Player, World } from '../types.ts';

export const WORLD_META: Record<
  World,
  {
    label: string;
    multKey: keyof Player;
  }
> = {
  gym: { label: 'Gym', multKey: 'mult_gym' },
  aerobics: { label: 'Aerobics', multKey: 'mult_aerobics' },
  university: { label: 'University', multKey: 'mult_university' },
  diet: { label: 'Diet', multKey: 'mult_diet' },
  household: { label: 'Household', multKey: 'mult_household' },
  reading: { label: 'Reading', multKey: 'mult_reading' },
};
