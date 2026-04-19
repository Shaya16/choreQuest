-- =============================================================================
-- Migration 0016: shop two-step state machine + push CHECK extension
-- =============================================================================
-- Adds the 'redemption_requested' state to purchases.status and a
-- redemption_requested_at timestamp. Also extends push_state.trigger_type to
-- permit the three new shop push types.
-- =============================================================================

-- 1. Status CHECK expansion on purchases.
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases
  add constraint purchases_status_check check (
    status in ('pending', 'redemption_requested', 'redeemed', 'cancelled')
  );

-- 2. Timestamp column for the buyer's redeem-now action.
alter table public.purchases
  add column if not exists redemption_requested_at timestamptz;

-- 3. Helpful indexes for the per-side queries the Shop screen runs.
create index if not exists idx_purchases_buyer_active
  on public.purchases(buyer_id)
  where status in ('pending', 'redemption_requested');
create index if not exists idx_purchases_target_active
  on public.purchases(target_id)
  where status in ('pending', 'redemption_requested');

-- 4. Extend push_state.trigger_type CHECK with the three shop event types.
alter table public.push_state drop constraint if exists push_state_trigger_type_check;
alter table public.push_state
  add constraint push_state_trigger_type_check check (
    trigger_type in (
      'lead_flip',
      'milestone',
      'round_ending',
      'round_closed',
      'end_of_day',
      'inactivity',
      'round_won',
      'round_lost',
      'round_tied',
      'tribute_picked',
      'tribute_paid',
      'purchase_made',
      'redemption_requested',
      'delivery_confirmed'
    )
  );
