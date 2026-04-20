-- =============================================================================
-- Migration 0019: dev RPC to stub an INCOMING shop deploy targeting the caller
-- =============================================================================
-- The shop's redesign added an INCOMING queue subsection that lights up when
-- the partner has called in (redeemed) a previously-bought item against you.
-- Manually testing that UI from one device requires a purchases row where
-- buyer = partner, target = me, status = 'redemption_requested'. The default
-- INSERT RLS policy ("authenticated insert own purchases") only allows
-- buyer_id = current_user_player_id(), so the client cannot create that row
-- directly. This RPC runs SECURITY DEFINER, picks a random active shop item,
-- and inserts the row with the inverted buyer/target so the caller sees it
-- in their INCOMING block on the Shop screen.
--
-- Returns the inserted row id (or raises if no partner / no catalog).
-- =============================================================================

create or replace function public.dev_stub_incoming_deploy()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_player_id uuid;
  v_partner_id uuid;
  v_shop_item_id uuid;
  v_purchase_id uuid;
  v_now timestamptz := now();
begin
  v_couple_id := public.current_user_couple_id();
  v_player_id := public.current_user_player_id();
  if v_couple_id is null or v_player_id is null then
    raise exception 'no couple context';
  end if;

  select id into v_partner_id
    from players
   where couple_id = v_couple_id
     and id <> v_player_id
   limit 1;
  if v_partner_id is null then
    raise exception 'no partner — summon a stub partner first';
  end if;

  select id into v_shop_item_id
    from shop_items
   where is_active = true
   order by random()
   limit 1;
  if v_shop_item_id is null then
    raise exception 'shop catalog is empty';
  end if;

  insert into purchases (
    shop_item_id, buyer_id, target_id,
    status, purchased_at, redemption_requested_at
  ) values (
    v_shop_item_id, v_partner_id, v_player_id,
    'redemption_requested', v_now, v_now
  )
  returning id into v_purchase_id;

  return v_purchase_id;
end;
$$;

grant execute on function public.dev_stub_incoming_deploy() to authenticated;
