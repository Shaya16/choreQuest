-- =============================================================================
-- Chore Quest — Default-Data Trigger (Migration 0003)
-- =============================================================================
-- When a new couple is created, auto-populate their 5 default Jackpot goals
-- (per PROJECT_BRIEF.md §10). The global seed file handles activities and
-- shop_items; this trigger handles per-couple defaults that can't be seeded
-- statically.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_default_jackpot_goals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.jackpot_goals (couple_id, name, description, target_coins, priority, icon_sprite)
  VALUES
    (NEW.id, '🌹 Surprise Flowers + Small Treat', 'A small thoughtful gesture', 500, 'next_up', null),
    (NEW.id, '🎁 Gift Day', 'A planned gift moment for each other', 1000, 'queue', null),
    (NEW.id, '🍷 Nice Dinner Out', 'A proper dinner somewhere good', 1500, 'next_up', null),
    (NEW.id, '🏖️ Weekend Getaway', 'Two nights away somewhere fun', 6000, 'queue', null),
    (NEW.id, '✈️ Real Trip Abroad', 'The big one — a real trip together', 15000, 'someday', null);
  RETURN NEW;
END;
$$;

CREATE TRIGGER couples_create_default_jackpot_goals
AFTER INSERT ON public.couples
FOR EACH ROW
EXECUTE FUNCTION public.create_default_jackpot_goals();
