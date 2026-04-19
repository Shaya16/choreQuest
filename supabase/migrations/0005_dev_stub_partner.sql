-- =============================================================================
-- Chore Quest — Dev Stub Partner (Migration 0005)
-- =============================================================================
-- Local/solo testing aid: lets a solo player inject a fake Player 2 into their
-- couple so 2-player HUDs, round math, and tribute flows can be exercised
-- without a real partner present.
--
-- The stub player has user_id = NULL (no auth user), arcade_class chosen by
-- the caller, display_name chosen by the caller. RLS-bypassed via SECURITY
-- DEFINER. Idempotent: if the couple already has >= 2 players, the existing
-- stub row is returned unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dev_summon_stub_partner(
  p_display_name TEXT,
  p_arcade_class TEXT
)
RETURNS players
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'Couple already has two real players — no room for a stub.';
  END IF;

  IF p_arcade_class NOT IN
    ('gym_fighter', 'vibe_queen', 'sweepman', 'chef_kong', 'nerd_tron') THEN
    RAISE EXCEPTION 'Invalid arcade_class: %', p_arcade_class;
  END IF;

  INSERT INTO players (user_id, couple_id, display_name, arcade_class)
  VALUES (NULL, v_couple_id, p_display_name, p_arcade_class)
  RETURNING * INTO v_new_stub;

  RETURN v_new_stub;
END;
$$;

REVOKE ALL ON FUNCTION public.dev_summon_stub_partner(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_summon_stub_partner(TEXT, TEXT) TO authenticated;

-- Companion: remove the stub so you can re-test the pair-invite flow.
CREATE OR REPLACE FUNCTION public.dev_banish_stub_partner()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_couple_id UUID;
  v_deleted INT;
BEGIN
  SELECT couple_id INTO v_couple_id
    FROM players
    WHERE user_id = auth.uid()
    LIMIT 1;

  IF v_couple_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM players
    WHERE couple_id = v_couple_id AND user_id IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.dev_banish_stub_partner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dev_banish_stub_partner() TO authenticated;
