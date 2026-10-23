-- Location: supabase/migrations/20260101000030_admin_mck_event_pagination.sql
-- Afriticket — 0030: paginated/searchable MCK event administration.
-- New RPC keeps the migration-0028 zero-argument function available for older clients.

DO $$
BEGIN
  IF to_regprocedure('public.admin_set_mck_event_tag(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration 0028 is required before migration 0030';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_mck_events_page(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_query text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  status text,
  starts_at timestamptz,
  programme_slug text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_query text := NULLIF(LEFT(BTRIM(COALESCE(p_query, '')), 120), '');
BEGIN
  IF NOT public.is_platform_staff('admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.slug,
    e.status::text,
    e.starts_at,
    e.programme_slug,
    count(*) OVER ()::bigint AS total_count
  FROM public.events AS e
  WHERE v_query IS NULL
     OR e.title ILIKE '%' || v_query || '%'
     OR e.slug ILIKE '%' || v_query || '%'
  ORDER BY e.starts_at DESC, e.id
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_mck_events_page(integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_mck_events_page(integer, integer, text)
  TO authenticated;
COMMENT ON FUNCTION public.admin_list_mck_events_page(integer, integer, text) IS
  'Returns one bounded page of Afriticket events for MCK administration; platform-admin-only with optional title/slug search and matching total count.';

NOTIFY pgrst, 'reload schema';
