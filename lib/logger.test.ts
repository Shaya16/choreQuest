// lib/logger.test.ts — Deno unit tests for computeLogValues().
//
// Run with:
//   deno test --no-check --allow-read --allow-env --sloppy-imports \
//     --import-map=lib/logger.test.imports.json lib/logger.test.ts
//
// Why the extra flags (vs debt.test.ts):
//   lib/logger.ts transitively imports supabase / worlds / timezone, which
//   pull in React Native deps Deno can't load. The import map redirects
//   those to data-URL / local stubs (lib/logger.test.stubs/) so the pure
//   computeLogValues function can be exercised. debt.ts stays fully pure
//   and needs none of this.
//
// These tests lock in the debt-debuff math invariants:
//   - coins_earned (and personal_share) halve under debtMultiplier=0.5
//   - xp_earned stays at rawBase (XP is a separate currency, constraint 11)
//   - round_value_earned is protected (doom-spiral prevention in cross-player
//     competition)
//   - bonus folds into rawBase BEFORE debt is applied
//   - round_value never includes bonus
//
// We import from './logger.ts' (explicit extension) so Deno resolves the
// module graph. Fixtures use `as Activity` / `as Player` casts so we only
// have to enumerate the fields computeLogValues actually reads.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeLogValues } from './logger.ts';
import type { Activity, Player } from './types.ts';

function act(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'a1',
    world: 'gym',
    tier: null,
    name: 'Gym session',
    description: null,
    base_value: 30,
    bonus: 0,
    daily_cap: 1,
    requires_photo: false,
    icon_sprite: null,
    is_custom: false,
    created_by_couple_id: null,
    is_active: true,
    round_value: 10,
    archived_at: null,
    ...overrides,
  } as Activity;
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    user_id: 'u1',
    couple_id: 'c1',
    display_name: 'P1',
    arcade_class: 'gym_fighter',
    avatar_sprite: '',
    mult_gym: 1.0,
    mult_aerobics: 1.0,
    mult_university: 1.0,
    mult_diet: 1.0,
    mult_household: 1.0,
    mult_reading: 1.0,
    current_combo_days: 0,
    combo_multiplier: 1.0,
    freezes_remaining: 2,
    last_log_date: null,
    lifetime_score: 0,
    personal_wallet: 0,
    lifetime_xp: 0,
    player_level: 1,
    current_title: 'Rookie',
    crowns: {} as Player['crowns'],
    belts: 0,
    instant_win_tokens: 0,
    upgrades: [],
    expo_push_token: null,
    created_at: '2026-04-20T00:00:00Z',
    ...overrides,
  } as Player;
}

// 1. No debt (default): coins = base × mults, xp = rawBase, round_value computed.
Deno.test('no debt: coins=base×mults, xp=rawBase, round_value via mults', () => {
  const v = computeLogValues(act(), player());
  assertEquals(v.coins_earned, 30);
  assertEquals(v.xp_earned, 30);
  assertEquals(v.round_value_earned, 10);
});

// 2. Debt 0.5: coins halved.
Deno.test('debt 0.5: coins halved', () => {
  const v = computeLogValues(act(), player(), 0.5);
  assertEquals(v.coins_earned, 15);
});

// 3. Debt 0.5: xp UNCHANGED (XP ignores debt — separate currency).
Deno.test('debt 0.5: xp unchanged (still rawBase)', () => {
  const v = computeLogValues(act(), player(), 0.5);
  assertEquals(v.xp_earned, 30);
});

// 4. Debt 0.5: round_value UNCHANGED (protect cross-player competition).
Deno.test('debt 0.5: round_value unchanged', () => {
  const v = computeLogValues(act(), player(), 0.5);
  assertEquals(v.round_value_earned, 10);
});

// 5. Debt + combo 1.5: floor(30 × 1.5 × 0.5) = 22.
Deno.test('debt 0.5 + combo 1.5: coins=22, xp=30', () => {
  const v = computeLogValues(act(), player({ combo_multiplier: 1.5 }), 0.5);
  assertEquals(v.coins_earned, 22);
  assertEquals(v.xp_earned, 30);
});

// 6. personal_share === coins, jackpot_share === 0 (v1 single wallet).
Deno.test('debt 0.5: personal_share=coins, jackpot_share=0', () => {
  const v = computeLogValues(act(), player(), 0.5);
  assertEquals(v.personal_share, v.coins_earned);
  assertEquals(v.jackpot_share, 0);
});

// 7. Bonus folds into rawBase BEFORE debt: floor((20+5) × 0.5) = 12.
Deno.test('bonus folds into rawBase before debt', () => {
  const v = computeLogValues(
    act({ base_value: 20, bonus: 5 }),
    player(),
    0.5
  );
  assertEquals(v.coins_earned, 12);
});

// 8. round_value does NOT include bonus (matches non-debt behavior).
Deno.test('round_value never includes bonus', () => {
  const v = computeLogValues(
    act({ base_value: 30, bonus: 0, round_value: 10 }),
    player(),
    0.5
  );
  assertEquals(v.round_value_earned, 10);
});

// 9. Odd base with debt floors correctly: floor(31 × 0.5) = 15.
Deno.test('odd base with debt floors correctly', () => {
  const v = computeLogValues(act({ base_value: 31 }), player(), 0.5);
  assertEquals(v.coins_earned, 15);
});
