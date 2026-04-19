-- =============================================================================
-- Chore Quest — Seed Data
-- =============================================================================
-- Seeds the global catalogs: 44 activities + 20 shop items.
-- Per-couple defaults (5 jackpot goals) are handled by the trigger in 0003.
-- Do NOT seed forever-layer tables (quests, power_ups, seasons, upgrades,
-- level_rewards, etc.) — they stay empty until their phase activates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ACTIVITIES (44 total) — mirrors post-migration-0018 state (dual-currency)
-- -----------------------------------------------------------------------------

-- 💪 GYM (2)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('gym', NULL, 'GYM SESSION', '45+ min', 30, 0, 1, false, 0),
  ('gym', NULL, 'NEW PR', 'lift', 0, 25, 3, true, 0);

-- 🏃 AEROBICS (3)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('aerobics', NULL, 'CARDIO', '30+ min', 20, 0, 1, false, 0),
  ('aerobics', NULL, 'LONG CARDIO', '60+ min', 40, 0, 1, false, 0),
  ('aerobics', NULL, 'CARDIO PR', 'personal best', 0, 25, 1, true, 0);

-- 🎓 UNIVERSITY (3)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('university', NULL, 'DEEP STUDY', '90 min · phone away', 25, 0, 4, false, 0),
  ('university', NULL, 'ASSIGNMENT', 'graded · submitted', 80, 0, 3, true, 0),
  ('university', NULL, 'EXAM', NULL, 120, 0, 2, false, 0);

-- 🥗 DIET (6)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('diet', NULL, 'MEAL PREP', 'full week', 60, 0, 1, true, 0),
  ('diet', NULL, 'CLEAN STREAK', '7 days', 0, 80, 1, false, 0),
  ('diet', NULL, 'DINNER', 'from scratch', 20, 0, 1, false, 0),
  ('diet', NULL, 'LUNCH', 'from scratch', 15, 0, 1, false, 0),
  ('diet', NULL, 'NO BOOZE', 'full day', 8, 0, 1, false, 0),
  ('diet', NULL, 'NEW RECIPE', 'healthy', 30, 0, 1, true, 0);

-- 🏠 HOUSEHOLD — Daily tier (9)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('household', 'daily', 'DISHES', 'full round', 5, 0, 2, false, 10),
  ('household', 'daily', 'TRASH', NULL, 4, 0, 1, false, 8),
  ('household', 'daily', 'TIDY ROOM', 'one room', 6, 0, 3, false, 10),
  ('household', 'daily', 'MAKE BED', NULL, 3, 0, 1, false, 5),
  ('household', 'daily', 'WIPE COUNTERS', 'kitchen', 4, 0, 1, false, 8),
  ('household', 'daily', 'QUICK SWEEP', 'one area', 5, 0, 2, false, 10),
  ('household', 'daily', 'DISHWASHER', 'load or unload', 4, 0, 2, false, 8),
  ('household', 'daily', 'POST-MEAL', 'full cleanup', 5, 0, 2, false, 10),
  ('household', 'daily', 'PET + PLANTS', 'feed · water', 5, 0, 1, false, 10);

-- 🏠 HOUSEHOLD — Weekly tier (8)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('household', 'weekly', 'LAUNDRY', 'wash · dry · fold', 15, 0, 1, false, 30),
  ('household', 'weekly', 'GROCERIES', 'receipt photo', 20, 0, 1, true, 40),
  ('household', 'weekly', 'BED SHEETS', 'full change', 15, 0, 1, false, 30),
  ('household', 'weekly', 'BATHROOM', 'quick clean', 10, 0, 1, false, 25),
  ('household', 'weekly', 'MOP FLOORS', NULL, 12, 0, 1, false, 25),
  ('household', 'weekly', 'FULL VACUUM', 'whole place', 15, 0, 1, false, 30),
  ('household', 'weekly', 'FRIDGE', 'interior clean', 12, 0, 1, false, 25),
  ('household', 'weekly', 'WIPE APPLIANCES', 'stove · microwave', 8, 0, 1, false, 20);

-- 🏠 HOUSEHOLD — Monthly / as-needed tier (7)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('household', 'monthly', 'DEEP CLEAN', 'one room', 40, 0, 2, true, 100),
  ('household', 'monthly', 'DECLUTTER', 'purge one zone', 60, 0, 1, true, 140),
  ('household', 'monthly', 'OVEN INSIDE', 'interior scrub', 50, 0, 1, false, 120),
  ('household', 'monthly', 'WASH BEDDING', 'blankets · duvet', 25, 0, 1, false, 80),
  ('household', 'monthly', 'DUST', 'whole place', 20, 0, 1, false, 80),
  ('household', 'monthly', 'FIX SMALL', 'unclog or repair', 30, 0, 2, false, 90),
  ('household', 'monthly', 'BUILD PROJECT', 'furniture · DIY', 80, 0, 1, true, 200);

-- 📚 READING (6)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo, round_value) VALUES
  ('reading', NULL, 'READ', '30 min · 20 pages', 10, 0, 2, false, 0),
  ('reading', NULL, 'DEEP READ', '60+ min · 40+ pages', 25, 0, 1, false, 0),
  ('reading', NULL, 'FINISHED BOOK', 'cover photo', 0, 80, 2, true, 0),
  ('reading', NULL, 'AUDIO LEARN', '30+ min', 8, 0, 2, false, 0),
  ('reading', NULL, 'PAPER', 'full read', 40, 0, 2, false, 0),
  ('reading', NULL, 'READ NOTES', 'summary', 15, 0, 2, false, 0);

-- -----------------------------------------------------------------------------
-- SHOP ITEMS (20 total)
-- -----------------------------------------------------------------------------

-- Pampering (4)
INSERT INTO shop_items (name, description, cost, category) VALUES
  ('🦶 Foot Rub (15 min)', '15-minute foot massage from partner', 150, 'pampering'),
  ('🧖 Back & Shoulder Rub (20 min)', '20-minute back and shoulder massage', 250, 'pampering'),
  ('💆 Proper Massage (30 min)', '30-minute proper full-body-ish massage', 500, 'pampering'),
  ('💆‍♀️ Full Massage (60 min)', 'The hour-long proper massage', 900, 'pampering');

-- Meals (3)
INSERT INTO shop_items (name, description, cost, category) VALUES
  ('🍳 Breakfast in Bed', 'Partner makes and delivers breakfast in bed', 300, 'meals'),
  ('🍝 Dinner of My Choice (They Cook)', 'You pick the dinner, they cook it', 400, 'meals'),
  ('🍵 Coffee/Tea Service (3 days)', 'Three mornings of coffee or tea service', 400, 'meals');

-- Chore Relief (5)
INSERT INTO shop_items (name, description, cost, category) VALUES
  ('🆓 Skip One Chore', 'Skip one chore of your choice, partner covers', 250, 'chore_relief'),
  ('🛒 No Grocery Run This Week', 'Partner handles the weekly grocery run', 400, 'chore_relief'),
  ('🧹 Deep Clean One Room', 'Partner deep-cleans a room of your choice', 500, 'chore_relief'),
  ('🍽️ Dishes For A Week', 'Partner does all dishes for a full week', 600, 'chore_relief'),
  ('🛏️ Sleep In (They Handle Morning)', 'Sleep in, partner runs the morning', 300, 'chore_relief');

-- Power (4)
INSERT INTO shop_items (name, description, cost, category) VALUES
  ('🚗 Chauffeur For A Day', 'Partner drives you everywhere for a full day', 500, 'power'),
  ('👑 Zero Chores Day', 'A day with zero chores required of you', 700, 'power'),
  ('📅 Plan Our Next Date Night', 'Partner plans the next date night end-to-end', 450, 'power'),
  ('🎵 Music Dictator (1 Week)', 'You control all shared music for a week', 200, 'power');

-- Wildcard (4)
INSERT INTO shop_items (name, description, cost, category) VALUES
  ('💐 Surprise Flowers', 'Surprise flowers from partner', 350, 'wildcard'),
  ('💌 Handwritten Love Note', 'Actual handwritten love note', 400, 'wildcard'),
  ('🎁 Small Surprise Gift', 'A small surprise gift from partner', 500, 'wildcard'),
  ('🤫 No-Phones Dinner', 'A full dinner with no phones', 200, 'wildcard');
