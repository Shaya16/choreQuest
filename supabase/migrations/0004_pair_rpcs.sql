-- =============================================================================
-- Chore Quest — Pairing RPCs (Migration 0004)
-- =============================================================================
-- The pair flow has a chicken-and-egg with RLS: when we INSERT a couple and
-- want the row back via RETURNING, the SELECT policy (`id = current_user_couple_id()`)
-- filters it out because the player isn't yet linked. Postgres reports this as
-- "new row violates row-level security policy".
--
-- Fix: two SECURITY DEFINER RPCs that atomically create/join + link the player.
-- These bypass RLS cleanly and give the client a single call site.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_couple_and_join(p_invite_code TEXT)
RETURNS couples
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_couple couples%ROWTYPE;
BEGIN
  SELECT id INTO v_player_id
    FROM players
    WHERE user_id = auth.uid()
    LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'No player row exists for current user. Create your character first.';
  END IF;

  INSERT INTO couples (invite_code)
  VALUES (p_invite_code)
  RETURNING * INTO v_couple;

  UPDATE players
  SET couple_id = v_couple.id
  WHERE id = v_player_id;

  RETURN v_couple;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_couple_by_code(p_invite_code TEXT)
RETURNS couples
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id UUID;
  v_couple couples%ROWTYPE;
BEGIN
  SELECT id INTO v_player_id
    FROM players
    WHERE user_id = auth.uid()
    LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'No player row exists for current user. Create your character first.';
  END IF;

  SELECT * INTO v_couple
    FROM couples
    WHERE invite_code = p_invite_code
    LIMIT 1;

  IF v_couple.id IS NULL THEN
    RAISE EXCEPTION 'No couple matches that code.';
  END IF;

  UPDATE players
  SET couple_id = v_couple.id
  WHERE id = v_player_id;

  RETURN v_couple;
END;
$$;

-- Lock down: only authenticated users can call these (Supabase already does
-- this by default for public functions, but being explicit is cheap).
REVOKE ALL ON FUNCTION public.create_couple_and_join(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_couple_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_couple_and_join(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_couple_by_code(TEXT) TO authenticated;
