-- =============================================================================
-- Migration 0013: fix round-rollover cron — must include Saturday UTC
-- =============================================================================
-- 0011's schedule '*/10 * * * 0,1' covers Sun+Mon UTC only. Jerusalem
-- midnight (Sun 00:00 local) is Sat 22:00 UTC in winter (UTC+2) or Sat 21:00
-- UTC in summer (UTC+3) — both Saturday UTC. The original cron missed the
-- entire window where rounds become due.
--
-- 0011 also had its DST offset values swapped in the comment (winter and
-- summer reversed). The schedule update below covers both regimes correctly.
--
-- Function logic stays the same — round-rollover-tick is idempotent. Adding
-- Saturday polls just fires the function during the actual cutover window.
-- =============================================================================

select cron.unschedule('round_rollover_tick');

select cron.schedule(
  'round_rollover_tick',
  '*/10 * * * 6,0,1',  -- Sat covers Jerusalem midnight; Sun+Mon give catch-up margin
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/round-rollover-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_service_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
