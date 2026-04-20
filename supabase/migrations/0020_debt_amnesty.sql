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

COMMIT;
