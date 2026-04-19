-- =============================================================================
-- Migration 0010: round-close fields beyond what 0001 shipped
-- =============================================================================
-- Adds:
--   loser_id              — paired with winner_id for clarity / cleaner queries
--   winner_bonus_coins    — coins awarded to winner on close, capped to 500
--   tribute_shop_item_id  — typed FK; replaces freeform tribute_selected text
--   tribute_paid_at       — timestamp; canonical "paid?" truth (boolean stays
--                          for backwards compat, will be dropped later)
-- =============================================================================

alter table public.rounds
  add column loser_id uuid references public.players(id) on delete set null,
  add column winner_bonus_coins int not null default 0,
  add column tribute_shop_item_id uuid references public.shop_items(id) on delete set null,
  add column tribute_paid_at timestamptz;

create index if not exists idx_rounds_loser on public.rounds(loser_id);
create index if not exists idx_rounds_tribute_unpaid
  on public.rounds(couple_id)
  where status = 'closed' and tribute_shop_item_id is not null and tribute_paid_at is null;
