-- Location: supabase/migrations/20260101000029_events_public_pricing_view.sql
-- Afriticket — 0029: safe event price projection for accurate discovery.
-- Additive only: leaves events_public, ticket_types_public, inventory and ticket writes unchanged.

DO $$
BEGIN
  IF to_regclass('public.events_public') IS NULL THEN
    RAISE EXCEPTION 'The events_public view is required before migration 0029';
  END IF;
  IF to_regclass('public.ticket_types_public') IS NULL THEN
    RAISE EXCEPTION 'The ticket_types_public view is required before migration 0029';
  END IF;
END;
$$;

-- This view exposes only the existing safe event projection and the lowest
-- currently available public ticket price; raw capacity remains hidden.
CREATE OR REPLACE VIEW public.events_public_priced
  WITH (security_barrier = true) AS
SELECT
  event_row.*,
  ticket_price.price_from_minor
FROM public.events_public AS event_row
LEFT JOIN (
  SELECT
    event_id,
    min(price_minor) FILTER (WHERE remaining > 0) AS price_from_minor
  FROM public.ticket_types_public
  GROUP BY event_id
) AS ticket_price ON ticket_price.event_id = event_row.id;

GRANT SELECT ON public.events_public_priced TO anon, authenticated;
COMMENT ON VIEW public.events_public_priced IS
  'Safe public event projection with the lowest available ticket price in minor currency units for database-side discovery filtering and sorting.';

NOTIFY pgrst, 'reload schema';
