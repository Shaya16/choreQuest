-- =============================================================================
-- Chore Quest — Seed Data
-- =============================================================================
-- Seeds the global catalogs: 57 activities + 20 shop items.
-- Per-couple defaults (5 jackpot goals) are handled by the trigger in 0003.
-- Do NOT seed forever-layer tables (quests, power_ups, seasons, upgrades,
-- level_rewards, etc.) — they stay empty until their phase activates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ACTIVITIES (57 total)
-- -----------------------------------------------------------------------------

-- 💪 GYM (2)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('gym', NULL, 'Gym session (45+ min)', 'Full session at the gym, 45 minutes or more', 30, 0, 1, false),
  ('gym', NULL, 'New PR (lift)', 'Personal record on a lift — attach photo', 0, 25, 3, true);

-- 🏃 AEROBICS (3)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('aerobics', NULL, 'Aerobics 30+ min', 'Cardio session, 30 minutes or more', 20, 0, 1, false),
  ('aerobics', NULL, 'Aerobics 60+ min', 'Long cardio session, 60 minutes or more', 40, 0, 1, false),
  ('aerobics', NULL, 'Cardio PR', 'New personal best on a cardio metric', 0, 25, 1, true);

-- 🎓 UNIVERSITY (3)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('university', NULL, 'Focused study block (90 min, phone away)', 'Deep focused study — 90 minutes, phone put away', 25, 0, 4, false),
  ('university', NULL, 'Assignment submitted', 'Submitted a graded assignment', 80, 0, 3, true),
  ('university', NULL, 'Exam taken', 'Sat a real exam', 120, 0, 2, false);

-- 🥗 DIET (11)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('diet', NULL, 'Hit daily macros / calorie target', 'Hit your macro or calorie target for the day', 15, 0, 1, false),
  ('diet', NULL, 'Meal prep (week)', 'Prepped meals for the week', 60, 0, 1, true),
  ('diet', NULL, '7-day clean streak', 'Finished a full 7-day clean-eating streak', 0, 80, 1, false),
  ('diet', NULL, 'Hit daily protein target', 'Hit your daily protein target', 10, 0, 1, false),
  ('diet', NULL, 'Hit daily water intake (2L+)', 'Drank 2L or more of water', 5, 0, 1, false),
  ('diet', NULL, 'Logged all meals in tracker', 'Logged every meal in your food tracker today', 8, 0, 1, false),
  ('diet', NULL, 'Cooked dinner from scratch', 'Dinner made at home from scratch', 20, 0, 1, false),
  ('diet', NULL, 'Cooked lunch from scratch', 'Lunch made at home from scratch', 15, 0, 1, false),
  ('diet', NULL, 'No junk food day', 'Full day with no junk food', 12, 0, 1, false),
  ('diet', NULL, 'No alcohol day', 'Full day with no alcohol', 8, 0, 1, false),
  ('diet', NULL, 'New healthy recipe tried', 'Tried a new healthy recipe', 30, 0, 1, true);

-- 🏠 HOUSEHOLD — Daily tier (9)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('household', 'daily', 'Dishes (full round)', 'A complete round of dishes', 5, 0, 2, false),
  ('household', 'daily', 'Take out trash', 'Took out the trash', 4, 0, 1, false),
  ('household', 'daily', 'Tidy a room', 'Tidied a full room', 6, 0, 3, false),
  ('household', 'daily', 'Make the bed', 'Made the bed properly', 3, 0, 1, false),
  ('household', 'daily', 'Wipe kitchen counters', 'Wiped down kitchen counters', 4, 0, 1, false),
  ('household', 'daily', 'Sweep / quick vacuum (one area)', 'Quick sweep or vacuum of one area', 5, 0, 2, false),
  ('household', 'daily', 'Dishwasher load or unload', 'Loaded or unloaded the dishwasher', 4, 0, 2, false),
  ('household', 'daily', 'Clean up after a meal', 'Full post-meal cleanup', 5, 0, 2, false),
  ('household', 'daily', 'Pet / plant care', 'Fed pet or watered plants', 5, 0, 1, false);

-- 🏠 HOUSEHOLD — Weekly tier (10)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('household', 'weekly', 'Laundry full cycle', 'Full laundry cycle: wash, dry, fold', 15, 0, 1, false),
  ('household', 'weekly', 'Grocery run', 'Did the grocery run — attach receipt/photo', 20, 0, 1, true),
  ('household', 'weekly', 'Change bed sheets', 'Changed the bed sheets', 15, 0, 1, false),
  ('household', 'weekly', 'Bathroom quick clean', 'Quick bathroom clean', 10, 0, 1, false),
  ('household', 'weekly', 'Mop floors', 'Mopped the floors', 12, 0, 1, false),
  ('household', 'weekly', 'Full vacuum (whole place)', 'Vacuumed the whole apartment', 15, 0, 1, false),
  ('household', 'weekly', 'Take out recycling', 'Took out the recycling', 5, 0, 1, false),
  ('household', 'weekly', 'Water all plants', 'Watered every plant in the place', 5, 0, 1, false),
  ('household', 'weekly', 'Clean out the fridge', 'Cleaned out the fridge interior', 12, 0, 1, false),
  ('household', 'weekly', 'Wipe down appliances (stove, microwave)', 'Wiped down major appliances', 8, 0, 1, false);

-- 🏠 HOUSEHOLD — Monthly / as-needed tier (12)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('household', 'monthly', 'Deep clean a room', 'Full deep-clean of one room', 40, 0, 2, true),
  ('household', 'monthly', 'Deep clean bathroom', 'Full deep-clean of the bathroom', 50, 0, 1, true),
  ('household', 'monthly', 'Deep clean kitchen', 'Full deep-clean of the kitchen', 50, 0, 1, true),
  ('household', 'monthly', 'Clean windows', 'Cleaned the windows', 30, 0, 1, false),
  ('household', 'monthly', 'Closet purge / declutter zone', 'Decluttered a zone or purged a closet', 60, 0, 1, true),
  ('household', 'monthly', 'Clean inside of fridge', 'Cleaned inside the fridge', 40, 0, 1, false),
  ('household', 'monthly', 'Clean inside of oven', 'Cleaned inside the oven', 50, 0, 1, false),
  ('household', 'monthly', 'Organize a drawer/cabinet', 'Organized a specific drawer or cabinet', 15, 0, 3, false),
  ('household', 'monthly', 'Wash bedding (blankets, duvet)', 'Washed large bedding items', 25, 0, 1, false),
  ('household', 'monthly', 'Dust the apartment', 'Dusted surfaces throughout', 20, 0, 1, false),
  ('household', 'monthly', 'Unclog / fix something small', 'Fixed a small household problem', 30, 0, 2, false),
  ('household', 'monthly', 'Assemble furniture / home project', 'Built furniture or did a home project', 80, 0, 1, true);

-- 📚 READING (7)
INSERT INTO activities (world, tier, name, description, base_value, bonus, daily_cap, requires_photo) VALUES
  ('reading', NULL, 'Reading session (30 min / 20 pages)', 'Solid 30-minute or 20-page reading session', 10, 0, 2, false),
  ('reading', NULL, 'Finished a book', 'Completed a book — attach cover photo', 0, 80, 2, true),
  ('reading', NULL, 'Reading sprint (15 min / 10 pages)', 'Quick 15-minute or 10-page sprint', 5, 0, 3, false),
  ('reading', NULL, 'Deep read (60+ min / 40+ pages)', 'Long focused reading session', 25, 0, 1, false),
  ('reading', NULL, 'Audiobook / podcast (30+ min, learning)', 'Learning audio content, 30 minutes or more', 8, 0, 2, false),
  ('reading', NULL, 'Read academic paper (full)', 'Read a full academic paper', 40, 0, 2, false),
  ('reading', NULL, 'Write reading notes / summary', 'Wrote notes or a summary of what you read', 15, 0, 2, false);

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
