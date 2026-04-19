-- =============================================================================
-- Migration 0008: push_state table and expo_push_token column
-- =============================================================================
-- Backs the live-partner-visibility feature:
--   * push_state tracks the last-sent variant index per (player, trigger_type)
--     so trash-talk text rotates and never repeats back-to-back.
--   * players.expo_push_token stores the target device for Expo Push API calls.
-- =============================================================================

create table public.push_state (
  player_id uuid not null references public.players(id) on delete cascade,
  trigger_type text not null check (
    trigger_type in (
      'lead_flip',
      'milestone',
      'round_ending',
      'round_closed',
      'end_of_day',
      'inactivity'
    )
  ),
  last_variant_index int,
  last_fired_at timestamptz,
  -- Per-round dedup state for the 4 triggers that dedup by round.
  -- Milestone stores the highest level crossed (100/250/500/1000); others
  -- store the round id they last fired for.
  dedup_round_id uuid references public.rounds(id) on delete set null,
  dedup_level int,
  -- Per-day dedup state for the 2 solo triggers (end_of_day, inactivity).
  dedup_date date,
  primary key (player_id, trigger_type)
);

alter table public.push_state enable row level security;

-- Player can read their own rotation state (useful for debugging).
create policy "push_state: players see own"
  on public.push_state
  for select
  to authenticated
  using (player_id = current_user_player_id());

-- Only service role writes (Edge Functions run as service role).
-- Deny policy absence = default deny for insert/update/delete by non-service-role.

alter table public.players add column expo_push_token text;
