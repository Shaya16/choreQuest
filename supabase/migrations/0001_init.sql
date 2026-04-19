-- =============================================================================
-- Chore Quest — Initial Schema (Migration 0001)
-- =============================================================================
-- Mirrors PROJECT_BRIEF.md §4 in full, INCLUDING all forever-layer tables
-- (Phase 2-5). Forever-layer tables stay empty in Phase 1 but exist from day 1
-- to avoid painful migrations later. Do NOT seed them.
-- =============================================================================

-- gen_random_uuid() is a built-in in Postgres 13+ (Supabase ships 15+).

-- -----------------------------------------------------------------------------
-- Core tables
-- -----------------------------------------------------------------------------

-- Couples (supports multi-couple in future, single couple for now)
CREATE TABLE couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT UNIQUE NOT NULL,
  -- Couple progression (forever layer)
  couple_level INT NOT NULL DEFAULT 1,
  couple_xp INT NOT NULL DEFAULT 0,
  current_season_id UUID,  -- FK added after seasons table exists
  paired_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id UUID REFERENCES couples(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  arcade_class TEXT NOT NULL CHECK (arcade_class IN
    ('gym_fighter', 'vibe_queen', 'sweepman', 'chef_kong', 'nerd_tron')),
  avatar_sprite TEXT NOT NULL DEFAULT '',

  -- Per-World difficulty multipliers
  mult_gym NUMERIC NOT NULL DEFAULT 1.0,
  mult_aerobics NUMERIC NOT NULL DEFAULT 1.0,
  mult_university NUMERIC NOT NULL DEFAULT 1.0,
  mult_diet NUMERIC NOT NULL DEFAULT 1.0,
  mult_household NUMERIC NOT NULL DEFAULT 1.0,
  mult_reading NUMERIC NOT NULL DEFAULT 1.0,

  -- Combo state
  current_combo_days INT NOT NULL DEFAULT 0,
  combo_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  freezes_remaining INT NOT NULL DEFAULT 2,
  last_log_date DATE,

  -- Totals
  lifetime_score INT NOT NULL DEFAULT 0,
  personal_wallet INT NOT NULL DEFAULT 0,

  -- Progression (forever layer — XP only goes up, never resets)
  lifetime_xp INT NOT NULL DEFAULT 0,
  player_level INT NOT NULL DEFAULT 1,
  current_title TEXT NOT NULL DEFAULT 'Rookie',

  -- Trophies
  crowns JSONB NOT NULL DEFAULT '{"gym":0,"aerobics":0,"university":0,"diet":0,"household":0,"reading":0}'::jsonb,
  belts INT NOT NULL DEFAULT 0,
  instant_win_tokens INT NOT NULL DEFAULT 0,

  -- Permanent upgrades purchased (forever layer)
  upgrades JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_couple ON players(couple_id);
CREATE INDEX idx_players_user ON players(user_id);

-- Weekly Rounds
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  number INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  -- Computed at round close
  p1_total INT,
  p2_total INT,
  margin INT,
  winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
  tribute_tier TEXT CHECK (tribute_tier IS NULL OR tribute_tier IN
    ('paper_cut', 'knockout', 'total_carnage', 'flawless')),
  tribute_selected TEXT,
  tribute_paid BOOLEAN NOT NULL DEFAULT false,
  crowns_json JSONB,
  mvp_title TEXT,
  highlight_photo_url TEXT,
  UNIQUE(couple_id, number)
);

CREATE INDEX idx_rounds_couple_status ON rounds(couple_id, status);

-- Activities master list
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world TEXT NOT NULL CHECK (world IN
    ('gym', 'aerobics', 'university', 'diet', 'household', 'reading')),
  tier TEXT CHECK (tier IS NULL OR tier IN ('daily', 'weekly', 'monthly')),
  name TEXT NOT NULL,
  description TEXT,
  base_value INT NOT NULL,
  bonus INT NOT NULL DEFAULT 0,
  daily_cap INT NOT NULL DEFAULT 1,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  icon_sprite TEXT,
  -- Forever-layer
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_by_couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_activities_world ON activities(world) WHERE is_active = true;

-- Logs (main write surface)
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  -- Computed at log time (immutable snapshot)
  base_value INT NOT NULL,
  player_multiplier NUMERIC NOT NULL,
  combo_multiplier NUMERIC NOT NULL,
  crit_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  daily_bonus_multiplier NUMERIC NOT NULL DEFAULT 1.0,     -- Phase 3
  weekly_hero_multiplier NUMERIC NOT NULL DEFAULT 1.0,     -- Phase 3
  season_multiplier NUMERIC NOT NULL DEFAULT 1.0,          -- Phase 4
  coins_earned INT NOT NULL,
  xp_earned INT NOT NULL,  -- = coins pre-season-mult (populated from day 1, forever-layer)
  jackpot_share INT NOT NULL,
  personal_share INT NOT NULL,
  evidence_url TEXT,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_player_logged ON logs(player_id, logged_at DESC);
CREATE INDEX idx_logs_round_player ON logs(round_id, player_id);
CREATE INDEX idx_logs_activity ON logs(activity_id);

-- Shop catalog
CREATE TABLE shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  cost INT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('pampering', 'meals', 'chore_relief', 'power', 'wildcard')),
  icon_sprite TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Purchases
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_item_id UUID NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'redeemed', 'cancelled'))
);

CREATE INDEX idx_purchases_target_status ON purchases(target_id, status);

-- Shared Jackpot goals
CREATE TABLE jackpot_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_coins INT NOT NULL,
  current_coins INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN
    ('active', 'achieved', 'celebrated', 'locked')),
  priority TEXT NOT NULL DEFAULT 'queue' CHECK (priority IN
    ('next_up', 'queue', 'someday')),
  is_visible BOOLEAN NOT NULL DEFAULT true,
  season_id UUID,  -- FK added after seasons exists (Phase 4)
  icon_sprite TEXT,
  achieved_on DATE
);

CREATE INDEX idx_jackpot_couple_status ON jackpot_goals(couple_id, status);

-- =============================================================================
-- FOREVER LAYER TABLES (Phase 2-5) — stay empty in Phase 1
-- =============================================================================

-- Power-ups catalog (Phase 3) — declared before quest_templates/level_rewards
-- which reference it
CREATE TABLE power_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon_sprite TEXT,
  effect_type TEXT NOT NULL,
  effect_params JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Quest templates (Phase 3)
CREATE TABLE quest_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('daily', 'weekly', 'monthly', 'milestone')),
  title TEXT NOT NULL,
  description TEXT,
  objective JSONB NOT NULL,
  reward_coins INT NOT NULL DEFAULT 0,
  reward_xp INT NOT NULL DEFAULT 0,
  reward_power_up_id UUID REFERENCES power_ups(id) ON DELETE SET NULL,
  reward_title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Active quest assignments per player (Phase 3)
CREATE TABLE player_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_template_id UUID NOT NULL REFERENCES quest_templates(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_player_quests_player_status ON player_quests(player_id, status);

-- Player's power-up inventory (Phase 3)
CREATE TABLE player_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  power_up_id UUID NOT NULL REFERENCES power_ups(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  obtained_from TEXT,
  used_at TIMESTAMPTZ
);

CREATE INDEX idx_inventory_player ON player_inventory(player_id) WHERE used_at IS NULL;

-- Active power-up effects (Phase 3)
CREATE TABLE active_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  power_up_id UUID NOT NULL REFERENCES power_ups(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  effect_params JSONB
);

CREATE INDEX idx_active_effects_player ON active_effects(player_id, expires_at);

-- Daily activity bonuses (Phase 3)
CREATE TABLE daily_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  bonus_multiplier NUMERIC NOT NULL DEFAULT 1.5,
  UNIQUE(couple_id, date, activity_id)
);

-- Weekly hero activity (Phase 3)
CREATE TABLE weekly_heroes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  round_id UUID NOT NULL UNIQUE REFERENCES rounds(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  bonus_multiplier NUMERIC NOT NULL DEFAULT 2.0
);

-- Seasons (Phase 4)
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL UNIQUE,
  theme TEXT NOT NULL,
  tagline TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  world_bonuses JSONB NOT NULL DEFAULT '{}'::jsonb,
  cinematic_intro_sprite TEXT,
  cinematic_outro_sprite TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false
);

-- Season passes (Phase 4)
CREATE TABLE season_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  tier INT NOT NULL DEFAULT 1,
  season_xp INT NOT NULL DEFAULT 0,
  rewards_claimed JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE(player_id, season_id)
);

-- Round modifiers (Phase 4)
CREATE TABLE round_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL UNIQUE REFERENCES rounds(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN
    ('standard', 'coop', 'handicap', 'world_lockdown', 'blind', 'opposite', 'chaos', 'championship')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Permanent upgrades catalog (Phase 2)
CREATE TABLE upgrades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cost_coins INT NOT NULL,
  required_level INT NOT NULL DEFAULT 1,
  required_couple_level INT NOT NULL DEFAULT 1,
  is_repeatable BOOLEAN NOT NULL DEFAULT false,
  effect_params JSONB
);

-- Level rewards (Phase 2)
CREATE TABLE level_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INT NOT NULL UNIQUE,
  xp_required INT NOT NULL,
  title TEXT,
  reward_coins INT NOT NULL DEFAULT 0,
  reward_power_up_id UUID REFERENCES power_ups(id) ON DELETE SET NULL,
  reward_description TEXT
);

-- -----------------------------------------------------------------------------
-- Forward-reference FKs (resolved now that all tables exist)
-- -----------------------------------------------------------------------------

ALTER TABLE couples
  ADD CONSTRAINT couples_current_season_fk
  FOREIGN KEY (current_season_id) REFERENCES seasons(id) ON DELETE SET NULL;

ALTER TABLE jackpot_goals
  ADD CONSTRAINT jackpot_goals_season_fk
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Helper: current user's couple_id (for RLS policies in 0002_rls.sql)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_couple_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT couple_id FROM public.players WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.players WHERE user_id = auth.uid() LIMIT 1
$$;
