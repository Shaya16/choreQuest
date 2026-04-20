-- =============================================================================
-- Migration 0021: Push notification for amnesty cancellations.
-- Fires when a purchase's cancelled_via flips to 'amnesty' (target paid 1.5x
-- to cancel the buyer's purchase). The buyer receives the push so they know
-- their coins are refunded. Mirrors the pg_net pattern used in 0017.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_amnesty_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url text;
  service_key text;
BEGIN
  IF NEW.cancelled_via = 'amnesty'
     AND (OLD.cancelled_via IS NULL OR OLD.cancelled_via <> 'amnesty') THEN
    SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets
      WHERE name = 'edge_functions_base_url';
    SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets
      WHERE name = 'edge_functions_service_key';
    IF base_url IS NULL OR service_key IS NULL THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := base_url || '/on-log-inserted',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('type', 'purchase_amnesty', 'purchase', to_jsonb(NEW))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchases_after_update_amnesty_cancelled ON public.purchases;
CREATE TRIGGER purchases_after_update_amnesty_cancelled
  AFTER UPDATE OF cancelled_via ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_amnesty_cancelled();

COMMIT;
