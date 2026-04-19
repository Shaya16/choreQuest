-- =============================================================================
-- Chore Quest — Row Level Security Policies (Migration 0002)
-- =============================================================================
-- Rule: couples only see their own data. Both players in a couple share full
-- visibility of everything scoped to their couple.
--
-- Uses the helpers defined in 0001_init.sql:
--   current_user_couple_id()  — returns the calling user's couple_id
--   current_user_player_id()  — returns the calling user's player row id
-- =============================================================================

-- Enable RLS on every table in the public schema that we want to lock down.
ALTER TABLE couples            ENABLE ROW LEVEL SECURITY;
ALTER TABLE players            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE jackpot_goals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE power_ups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_quests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_effects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_bonuses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_heroes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_passes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_modifiers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_rewards      ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Catalog tables: readable by all authenticated users, writeable by none.
-- (Seeded once; no user-facing writes except custom activities.)
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read activities"
  ON activities FOR SELECT TO authenticated
  USING (
    is_custom = false
    OR created_by_couple_id = current_user_couple_id()
  );

CREATE POLICY "authenticated insert own custom activities"
  ON activities FOR INSERT TO authenticated
  WITH CHECK (
    is_custom = true
    AND created_by_couple_id = current_user_couple_id()
  );

CREATE POLICY "authenticated read shop_items"
  ON shop_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read power_ups"
  ON power_ups FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read quest_templates"
  ON quest_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read seasons"
  ON seasons FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read upgrades"
  ON upgrades FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read level_rewards"
  ON level_rewards FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- Couples: members see their own couple. Anyone authenticated can look up by
-- invite_code to join (necessary for partner pairing flow).
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read own couple"
  ON couples FOR SELECT TO authenticated
  USING (id = current_user_couple_id());

CREATE POLICY "authenticated insert couple"
  ON couples FOR INSERT TO authenticated
  WITH CHECK (true);  -- Anyone signed in can create a couple (pairing flow)

CREATE POLICY "authenticated update own couple"
  ON couples FOR UPDATE TO authenticated
  USING (id = current_user_couple_id())
  WITH CHECK (id = current_user_couple_id());

-- -----------------------------------------------------------------------------
-- Players: both players in a couple see each other fully.
-- A user creates their own player row during onboarding.
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read couple players"
  ON players FOR SELECT TO authenticated
  USING (
    couple_id = current_user_couple_id()
    OR user_id = auth.uid()
  );

CREATE POLICY "authenticated insert own player"
  ON players FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated update own player"
  ON players FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Rounds: couple-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read couple rounds"
  ON rounds FOR SELECT TO authenticated
  USING (couple_id = current_user_couple_id());

CREATE POLICY "authenticated insert couple rounds"
  ON rounds FOR INSERT TO authenticated
  WITH CHECK (couple_id = current_user_couple_id());

CREATE POLICY "authenticated update couple rounds"
  ON rounds FOR UPDATE TO authenticated
  USING (couple_id = current_user_couple_id())
  WITH CHECK (couple_id = current_user_couple_id());

-- -----------------------------------------------------------------------------
-- Logs: written by the player, visible to both players in the couple
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read couple logs"
  ON logs FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE couple_id = current_user_couple_id())
  );

CREATE POLICY "authenticated insert own logs"
  ON logs FOR INSERT TO authenticated
  WITH CHECK (player_id = current_user_player_id());

-- Logs are immutable by design (no UPDATE / DELETE policies)

-- -----------------------------------------------------------------------------
-- Purchases: either buyer or target can see; only buyer can create; target can
-- mark as redeemed
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read couple purchases"
  ON purchases FOR SELECT TO authenticated
  USING (
    buyer_id IN (SELECT id FROM players WHERE couple_id = current_user_couple_id())
  );

CREATE POLICY "authenticated insert own purchases"
  ON purchases FOR INSERT TO authenticated
  WITH CHECK (buyer_id = current_user_player_id());

CREATE POLICY "authenticated update couple purchases"
  ON purchases FOR UPDATE TO authenticated
  USING (
    buyer_id IN (SELECT id FROM players WHERE couple_id = current_user_couple_id())
  );

-- -----------------------------------------------------------------------------
-- Jackpot goals: both players see them all, both can update
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read couple jackpot_goals"
  ON jackpot_goals FOR SELECT TO authenticated
  USING (couple_id = current_user_couple_id());

CREATE POLICY "authenticated insert couple jackpot_goals"
  ON jackpot_goals FOR INSERT TO authenticated
  WITH CHECK (couple_id = current_user_couple_id());

CREATE POLICY "authenticated update couple jackpot_goals"
  ON jackpot_goals FOR UPDATE TO authenticated
  USING (couple_id = current_user_couple_id())
  WITH CHECK (couple_id = current_user_couple_id());

-- -----------------------------------------------------------------------------
-- Forever-layer per-player tables (Phase 2-5) — couple visibility
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read couple player_quests"
  ON player_quests FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE couple_id = current_user_couple_id())
  );

CREATE POLICY "authenticated manage own player_quests"
  ON player_quests FOR ALL TO authenticated
  USING (player_id = current_user_player_id())
  WITH CHECK (player_id = current_user_player_id());

CREATE POLICY "authenticated read couple player_inventory"
  ON player_inventory FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE couple_id = current_user_couple_id())
  );

CREATE POLICY "authenticated manage own player_inventory"
  ON player_inventory FOR ALL TO authenticated
  USING (player_id = current_user_player_id())
  WITH CHECK (player_id = current_user_player_id());

CREATE POLICY "authenticated read couple active_effects"
  ON active_effects FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE couple_id = current_user_couple_id())
  );

CREATE POLICY "authenticated manage own active_effects"
  ON active_effects FOR ALL TO authenticated
  USING (player_id = current_user_player_id())
  WITH CHECK (player_id = current_user_player_id());

CREATE POLICY "authenticated read couple season_passes"
  ON season_passes FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM players WHERE couple_id = current_user_couple_id())
  );

CREATE POLICY "authenticated manage own season_passes"
  ON season_passes FOR ALL TO authenticated
  USING (player_id = current_user_player_id())
  WITH CHECK (player_id = current_user_player_id());

-- -----------------------------------------------------------------------------
-- Forever-layer per-couple tables (Phase 3-4)
-- -----------------------------------------------------------------------------

CREATE POLICY "authenticated read couple daily_bonuses"
  ON daily_bonuses FOR SELECT TO authenticated
  USING (couple_id = current_user_couple_id());

CREATE POLICY "authenticated read couple weekly_heroes"
  ON weekly_heroes FOR SELECT TO authenticated
  USING (couple_id = current_user_couple_id());

CREATE POLICY "authenticated read round_modifiers"
  ON round_modifiers FOR SELECT TO authenticated
  USING (
    round_id IN (SELECT id FROM rounds WHERE couple_id = current_user_couple_id())
  );
