-- =============================================================================
-- Chore Quest - Add Shay + Kessy arcade classes (Migration 0006)
-- =============================================================================
-- Extends the arcade_class CHECK constraint and the dev_summon_stub_partner
-- RPC to accept 'shay' and 'kessy' as playable classes, on top of the five
-- archetypes from migration 0001.
--
-- If the Supabase SQL editor ever complains about the constraint name, run:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.players'::regclass AND contype = 'c';
-- and substitute whatever name you find in the DROP line below.
-- =============================================================================

-- Part 1: Update the arcade_class CHECK constraint.
ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_arcade_class_check;

ALTER TABLE public.players
  ADD CONSTRAINT players_arcade_class_check
  CHECK (arcade_class IN (
    'gym_fighter',
    'vibe_queen',
    'sweepman',
    'chef_kong',
    'nerd_tron',
    'shay',
    'kessy'
  ));

-- Part 2: Keep the stub-partner RPC validation list in sync. Uses a named
-- dollar-quote tag ($stub$) so nothing in the body can confuse a naive
-- statement splitter.
CREATE OR REPLACE FUNCTION public.dev_summon_stub_partner(
  p_display_name TEXT,
  p_arcade_class TEXT
)
RETURNS players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $stub$
DECLARE
  v_couple_id UUID;
  v_existing_count INT;
  v_existing_stub players%ROWTYPE;
  v_new_stub players%ROWTYPE;
BEGIN
  SELECT couple_id INTO v_couple_id
    FROM players
    WHERE user_id = auth.uid()
    LIMIT 1;

  IF v_couple_id IS NULL THEN
    RAISE EXCEPTION 'Caller is not in a couple yet. Create or join one first.';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
    FROM players
    WHERE couple_id = v_couple_id;

  IF v_existing_count >= 2 THEN
    SELECT * INTO v_existing_stub
      FROM players
      WHERE couple_id = v_couple_id AND user_id IS NULL
      LIMIT 1;
    IF v_existing_stub.id IS NOT NULL THEN
      RETURN v_existing_stub;
    END IF;
    RAISE EXCEPTION 'Couple already has two real players - no room for a stub.';
  END IF;

  IF p_arcade_class NOT IN
    ('gym_fighter', 'vibe_queen', 'sweepman', 'chef_kong', 'nerd_tron', 'shay', 'kessy') THEN
    RAISE EXCEPTION 'Invalid arcade_class: %', p_arcade_class;
  END IF;

  INSERT INTO players (user_id, couple_id, display_name, arcade_class)
  VALUES (NULL, v_couple_id, p_display_name, p_arcade_class)
  RETURNING * INTO v_new_stub;

  RETURN v_new_stub;
END;
$stub$;

REVOKE ALL ON FUNCTION public.dev_summon_stub_partner(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_summon_stub_partner(TEXT, TEXT) TO authenticated;
