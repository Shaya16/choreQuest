-- Prevent duplicate active rounds per couple. The client's ensureActiveRound
-- races on concurrent boots (home + menu + strike-select all call it at once):
-- each reader finds no active round and each writer inserts one, leaving
-- multiple rows with status='active' for the same couple. That cascades —
-- subsequent boots pick up >1 row, the code falls through to insert again,
-- and rounds multiply forever (we hit 1172 dupes in dev before catching it).
--
-- A unique partial index on (couple_id) where status='active' lets Postgres
-- reject all but one of the concurrent inserts. The loser gets a
-- unique-violation error; the client's ensureActiveRound now catches that
-- and re-reads to return the winner.
create unique index if not exists rounds_one_active_per_couple
  on public.rounds (couple_id)
  where status = 'active';
