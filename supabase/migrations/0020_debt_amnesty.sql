-- Migration 0020: Debt debuff — amnesty fee infrastructure.
-- Adds a cancelled_via audit column on purchases and a new amnesty_fees
-- ledger table that getSpendableCoins queries to deduct the fee from
-- the target who bought amnesty. No breaking changes to existing columns.

BEGIN;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS cancelled_via TEXT
  CHECK (cancelled_via IN ('amnesty', 'buyer_cancel') OR cancelled_via IS NULL);

CREATE TABLE IF NOT EXISTS amnesty_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  payer_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  amount INT NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amnesty_fees_payer_id_idx
  ON amnesty_fees(payer_id);

CREATE INDEX IF NOT EXISTS amnesty_fees_purchase_id_idx
  ON amnesty_fees(purchase_id);

-- RLS: a player can read amnesty_fees where payer is in their couple.
ALTER TABLE amnesty_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY amnesty_fees_read ON amnesty_fees
  FOR SELECT
  USING (
    payer_id IN (
      SELECT p.id FROM players p
      WHERE p.couple_id = (
        SELECT couple_id FROM players WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy — only the purchase_amnesty RPC
-- (SECURITY DEFINER) writes to this table.

CREATE OR REPLACE FUNCTION public.purchase_amnesty(p_purchase_id UUID)
RETURNS TABLE(
  fee INT,
  refund INT,
  target_spendable INT,
  buyer_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase purchases%ROWTYPE;
  v_item     shop_items%ROWTYPE;
  v_caller_player_id UUID;
  v_fee INT;
  v_spendable INT;
BEGIN
  -- Resolve caller → players.id
  SELECT id INTO v_caller_player_id
    FROM players
    WHERE user_id = auth.uid()
    LIMIT 1;
  IF v_caller_player_id IS NULL THEN
    RAISE EXCEPTION 'no_player_for_auth_user';
  END IF;

  -- Lock the purchase row for the transaction
  SELECT * INTO v_purchase
    FROM purchases
    WHERE id = p_purchase_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_not_found';
  END IF;

  IF v_purchase.target_id <> v_caller_player_id THEN
    RAISE EXCEPTION 'not_target';
  END IF;

  IF v_purchase.status NOT IN ('pending', 'redemption_requested') THEN
    RAISE EXCEPTION 'purchase_not_open';
  END IF;

  SELECT * INTO v_item
    FROM shop_items
    WHERE id = v_purchase.shop_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_item_not_found';
  END IF;

  v_fee := ceil(v_item.cost * 1.5)::INT;

  -- Compute caller's spendable coins inline (mirrors lib/wallet.ts::getSpendableCoins)
  SELECT COALESCE(SUM(l.personal_share + l.jackpot_share), 0)::INT
       + COALESCE((SELECT SUM(r.winner_bonus_coins) FROM rounds r WHERE r.winner_id = v_caller_player_id), 0)::INT
       - COALESCE((SELECT SUM(si.cost)
                     FROM purchases p
                     JOIN shop_items si ON si.id = p.shop_item_id
                     WHERE p.buyer_id = v_caller_player_id
                       AND p.status <> 'cancelled'), 0)::INT
       - COALESCE((SELECT SUM(af.amount) FROM amnesty_fees af WHERE af.payer_id = v_caller_player_id), 0)::INT
    INTO v_spendable
    FROM logs l
    WHERE l.player_id = v_caller_player_id;

  IF v_spendable < v_fee THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;

  -- Write the ledger entry and cancel the purchase atomically
  INSERT INTO amnesty_fees (purchase_id, payer_id, amount)
    VALUES (p_purchase_id, v_caller_player_id, v_fee);

  UPDATE purchases
     SET status = 'cancelled',
         cancelled_via = 'amnesty',
         redeemed_at = now()
   WHERE id = p_purchase_id;

  RETURN QUERY SELECT
    v_fee AS fee,
    v_item.cost AS refund,
    (v_spendable - v_fee) AS target_spendable,
    v_purchase.buyer_id AS buyer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_amnesty(UUID) TO authenticated;

COMMIT;
