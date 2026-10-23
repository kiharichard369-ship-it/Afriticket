-- Location: supabase/migrations/20260101000028_mck_partnership_management.sql
-- Afriticket — 0028: MCK programme management
-- Additive follow-on to 0027. Do not rerun 0027 when it is already applied.
-- This migration adds editable package tiers, approved public partner records,
-- explicit MCK event tagging, and admin-only management RPCs. It does not alter
-- payments, orders, tickets, ticket inventory, or any existing event status.

DO $$
BEGIN
  IF to_regclass('public.corporate_partnership_enquiries') IS NULL THEN
    RAISE EXCEPTION 'Migration 0027 is required before migration 0028';
  END IF;
  IF to_regprocedure('public.is_platform_staff(platform_role)') IS NULL THEN
    RAISE EXCEPTION 'The platform-admin role helper is missing; apply the platform-role migrations first';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.mck_partnership_tiers (
  tier_key text PRIMARY KEY
    CHECK (tier_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  price_kes integer NOT NULL CHECK (price_kes > 0),
  benefits text[] NOT NULL
    CHECK (cardinality(benefits) BETWEEN 1 AND 20)
    CHECK (array_position(benefits, NULL) IS NULL),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mck_partnership_tiers_active_sort_idx
  ON public.mck_partnership_tiers (is_active, sort_order, name);

INSERT INTO public.mck_partnership_tiers
  (tier_key, name, price_kes, benefits, sort_order, is_active)
VALUES
  ('supporting', 'Supporting Partner', 30000, ARRAY[
    'One co-created short-form video',
    'Standard logo position on the event backdrop',
    'Rotating logo placement on venue screens',
    'Partner credit in the event programme magazine',
    'One dinner-and-gala admission',
    'Product display area'
  ]::text[], 10, true),
  ('impact', 'Impact Partner', 50000, ARRAY[
    'Two co-created short-form videos',
    'Standard logo position on the event backdrop',
    'Rotating logo placement on venue screens',
    'Quarter-page advert in the event programme',
    'Two dinner-and-gala admissions',
    'Standard partner display table'
  ]::text[], 20, true),
  ('leadership', 'Leadership Partner', 100000, ARRAY[
    'Three co-created short-form videos',
    'Prominent logo position on the event backdrop',
    'Featured brand slide on venue screens',
    'Half-page corporate programme profile',
    'Four dinner-and-gala admissions',
    'Branded partner showcase table',
    'Association with an impact initiative'
  ]::text[], 30, true),
  ('strategic-impact', 'Strategic Impact Partner', 150000, ARRAY[
    'Four co-created short-form videos',
    'Priority logo position on the event backdrop',
    'Featured venue-screen slide and promotional video',
    'Full-page corporate or CSR programme feature',
    'Six dinner-and-gala admissions',
    'Priority partner showcase table',
    'Priority association with an impact initiative',
    'Priority event branding and recognition'
  ]::text[], 40, true)
ON CONFLICT (tier_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mck_corporate_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_name text NOT NULL
    CHECK (char_length(btrim(organisation_name)) BETWEEN 2 AND 160),
  public_name text NOT NULL
    CHECK (char_length(btrim(public_name)) BETWEEN 2 AND 120),
  partnership_type text NOT NULL
    CHECK (partnership_type IN ('cash', 'in_kind')),
  tier_key text REFERENCES public.mck_partnership_tiers (tier_key) ON DELETE RESTRICT,
  description text
    CHECK (description IS NULL OR char_length(description) <= 600),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'inactive')),
  is_public boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mck_corporate_partners_kind_tier_check CHECK (
    (partnership_type = 'cash' AND tier_key IS NOT NULL)
    OR (partnership_type = 'in_kind' AND tier_key IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS mck_corporate_partners_public_sort_idx
  ON public.mck_corporate_partners (is_public, status, sort_order, public_name);

ALTER TABLE public.mck_partnership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mck_corporate_partners ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mck_partnership_tiers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mck_partnership_tiers TO anon, authenticated;
DROP POLICY IF EXISTS "MCK tiers: public reads active" ON public.mck_partnership_tiers;
CREATE POLICY "MCK tiers: public reads active"
  ON public.mck_partnership_tiers FOR SELECT TO anon, authenticated
  USING (is_active);
DROP POLICY IF EXISTS "MCK tiers: administrators read all" ON public.mck_partnership_tiers;
CREATE POLICY "MCK tiers: administrators read all"
  ON public.mck_partnership_tiers FOR SELECT TO authenticated
  USING (public.is_platform_staff('admin'));

REVOKE ALL ON TABLE public.mck_corporate_partners FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mck_corporate_partners TO authenticated;
DROP POLICY IF EXISTS "MCK partners: administrators read all" ON public.mck_corporate_partners;
CREATE POLICY "MCK partners: administrators read all"
  ON public.mck_corporate_partners FOR SELECT TO authenticated
  USING (public.is_platform_staff('admin'));

-- These views expose only published programme facts; private management fields
-- stay behind table RLS and admin-checked RPCs.
CREATE OR REPLACE VIEW public.mck_active_partnership_tiers
  WITH (security_barrier = true) AS
SELECT tier_key, name, price_kes, benefits, sort_order
FROM public.mck_partnership_tiers
WHERE is_active = true;
GRANT SELECT ON public.mck_active_partnership_tiers TO anon, authenticated;

CREATE OR REPLACE VIEW public.mck_public_partners
  WITH (security_barrier = true) AS
SELECT
  p.id,
  p.public_name,
  p.partnership_type,
  p.tier_key,
  t.name AS tier_name,
  p.description,
  p.sort_order
FROM public.mck_corporate_partners p
LEFT JOIN public.mck_partnership_tiers t ON t.tier_key = p.tier_key
WHERE p.status = 'active' AND p.is_public = true;
GRANT SELECT ON public.mck_public_partners TO anon, authenticated;

-- Keep a stable snapshot on each enquiry so later package edits do not rewrite
-- the terms the organisation originally asked about.
ALTER TABLE public.corporate_partnership_enquiries
  ADD COLUMN IF NOT EXISTS tier_name_snapshot text,
  ADD COLUMN IF NOT EXISTS tier_price_snapshot integer;

-- 0027's inline tier allow-list is replaced by a foreign key to managed tiers.
ALTER TABLE public.corporate_partnership_enquiries
  DROP CONSTRAINT IF EXISTS corporate_partnership_enquiries_tier_key_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.corporate_partnership_enquiries'::regclass
      AND conname = 'corporate_partnership_enquiries_tier_key_fkey'
  ) THEN
    ALTER TABLE public.corporate_partnership_enquiries
      ADD CONSTRAINT corporate_partnership_enquiries_tier_key_fkey
      FOREIGN KEY (tier_key) REFERENCES public.mck_partnership_tiers (tier_key)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

UPDATE public.corporate_partnership_enquiries e
SET tier_name_snapshot = t.name,
    tier_price_snapshot = t.price_kes
FROM public.mck_partnership_tiers t
WHERE e.tier_key = t.tier_key
  AND (e.tier_name_snapshot IS NULL OR e.tier_price_snapshot IS NULL);

-- Replace only the existing 0027 submission function body/signature; preserve
-- its rate limit, honeypot, validation, execute-only PII boundary and grants.
CREATE OR REPLACE FUNCTION public.submit_corporate_partnership_enquiry(
  p_organisation_name text,
  p_contact_email text,
  p_partnership_type text,
  p_tier_key text,
  p_message text,
  p_consent_to_contact boolean,
  p_rate_limit_key uuid,
  p_website text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_organisation_name text := btrim(coalesce(p_organisation_name, ''));
  v_contact_email text := lower(btrim(coalesce(p_contact_email, '')));
  v_partnership_type text := lower(btrim(coalesce(p_partnership_type, '')));
  v_tier_key text := nullif(lower(btrim(coalesce(p_tier_key, ''))), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_tier_name text;
  v_tier_price integer;
  v_enquiry_id uuid;
BEGIN
  IF nullif(btrim(coalesce(p_website, '')), '') IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF p_consent_to_contact IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'consent_required';
  END IF;
  IF char_length(v_organisation_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'invalid_organisation_name';
  END IF;
  IF char_length(v_contact_email) NOT BETWEEN 5 AND 254
     OR v_contact_email NOT LIKE '%_@_%._%'
     OR v_contact_email ~ '[[:space:]]' THEN
    RAISE EXCEPTION 'invalid_contact_email';
  END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  IF v_partnership_type = 'cash' THEN
    IF v_tier_key IS NULL THEN
      RAISE EXCEPTION 'invalid_partnership_tier';
    END IF;
    SELECT name, price_kes INTO v_tier_name, v_tier_price
    FROM public.mck_partnership_tiers
    WHERE tier_key = v_tier_key AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_partnership_tier';
    END IF;
  ELSIF v_partnership_type = 'in_kind' THEN
    IF v_tier_key IS NOT NULL THEN
      RAISE EXCEPTION 'in_kind_has_no_cash_tier';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_partnership_type';
  END IF;

  IF p_rate_limit_key IS NULL THEN
    RAISE EXCEPTION 'rate_limit_key_required';
  END IF;
  IF NOT public.check_rate_limit(
    'corporate_partnership_enquiry:' || p_rate_limit_key::text,
    3,
    interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'rate_limited: please wait before submitting another enquiry';
  END IF;

  INSERT INTO public.corporate_partnership_enquiries (
    organisation_name, contact_email, partnership_type, tier_key, message,
    consent_to_contact, tier_name_snapshot, tier_price_snapshot
  ) VALUES (
    v_organisation_name, v_contact_email, v_partnership_type, v_tier_key, v_message,
    true, v_tier_name, v_tier_price
  ) RETURNING id INTO v_enquiry_id;

  RETURN v_enquiry_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_corporate_partnership_enquiry(text, text, text, text, text, boolean, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_corporate_partnership_enquiry(text, text, text, text, text, boolean, uuid, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_mck_partnership_tier(
  p_tier_key text,
  p_name text,
  p_price_kes integer,
  p_benefits text[],
  p_sort_order integer,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_key text := lower(btrim(coalesce(p_tier_key, '')));
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_platform_staff('admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_key) > 80 THEN
    RAISE EXCEPTION 'invalid_tier_key';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_tier_name';
  END IF;
  IF p_price_kes IS NULL OR p_price_kes < 1 OR p_price_kes > 100000000 THEN
    RAISE EXCEPTION 'invalid_tier_price';
  END IF;
  IF p_benefits IS NULL OR cardinality(p_benefits) NOT BETWEEN 1 AND 20
     OR EXISTS (SELECT 1 FROM unnest(p_benefits) benefit WHERE char_length(btrim(benefit)) NOT BETWEEN 1 AND 300) THEN
    RAISE EXCEPTION 'invalid_tier_benefits';
  END IF;
  IF p_sort_order IS NULL OR p_sort_order NOT BETWEEN 0 AND 10000 OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'invalid_tier_display_settings';
  END IF;

  INSERT INTO public.mck_partnership_tiers (tier_key, name, price_kes, benefits, sort_order, is_active)
  VALUES (v_key, v_name, p_price_kes, ARRAY(SELECT btrim(value) FROM unnest(p_benefits) WITH ORDINALITY AS item(value, ord) ORDER BY ord), p_sort_order, p_is_active)
  ON CONFLICT (tier_key) DO UPDATE SET
    name = EXCLUDED.name,
    price_kes = EXCLUDED.price_kes,
    benefits = EXCLUDED.benefits,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(), 'platform_staff', 'manage_mck_partnership_tier', 'mck_partnership_tier', NULL,
    jsonb_build_object('tier_key', v_key, 'is_active', p_is_active, 'price_kes', p_price_kes)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_mck_partnership_tier(text, text, integer, text[], integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_mck_partnership_tier(text, text, integer, text[], integer, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_mck_partner(
  p_partner_id uuid,
  p_organisation_name text,
  p_public_name text,
  p_partnership_type text,
  p_tier_key text,
  p_description text,
  p_status text,
  p_is_public boolean,
  p_sort_order integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_organisation_name text := btrim(coalesce(p_organisation_name, ''));
  v_public_name text := btrim(coalesce(p_public_name, ''));
  v_partnership_type text := lower(btrim(coalesce(p_partnership_type, '')));
  v_tier_key text := nullif(lower(btrim(coalesce(p_tier_key, ''))), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_partner_id uuid;
BEGIN
  IF NOT public.is_platform_staff('admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF char_length(v_organisation_name) NOT BETWEEN 2 AND 160
     OR char_length(v_public_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_partner_name';
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 600 THEN
    RAISE EXCEPTION 'partner_description_too_long';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'completed', 'inactive') THEN
    RAISE EXCEPTION 'invalid_partner_status';
  END IF;
  IF p_is_public IS NULL OR p_sort_order IS NULL OR p_sort_order NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'invalid_partner_display_settings';
  END IF;

  IF v_partnership_type = 'cash' THEN
    IF v_tier_key IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.mck_partnership_tiers WHERE tier_key = v_tier_key
    ) THEN
      RAISE EXCEPTION 'invalid_partner_tier';
    END IF;
  ELSIF v_partnership_type = 'in_kind' THEN
    IF v_tier_key IS NOT NULL THEN
      RAISE EXCEPTION 'in_kind_has_no_cash_tier';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_partnership_type';
  END IF;

  IF p_partner_id IS NULL THEN
    INSERT INTO public.mck_corporate_partners (
      organisation_name, public_name, partnership_type, tier_key, description,
      status, is_public, sort_order
    ) VALUES (
      v_organisation_name, v_public_name, v_partnership_type, v_tier_key, v_description,
      p_status, p_is_public, p_sort_order
    ) RETURNING id INTO v_partner_id;
  ELSE
    UPDATE public.mck_corporate_partners
    SET organisation_name = v_organisation_name,
        public_name = v_public_name,
        partnership_type = v_partnership_type,
        tier_key = v_tier_key,
        description = v_description,
        status = p_status,
        is_public = p_is_public,
        sort_order = p_sort_order,
        updated_at = now()
    WHERE id = p_partner_id
    RETURNING id INTO v_partner_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'partner_not_found';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(), 'platform_staff', 'manage_mck_corporate_partner', 'mck_corporate_partner', v_partner_id,
    jsonb_build_object('partnership_type', v_partnership_type, 'status', p_status, 'is_public', p_is_public)
  );
  RETURN v_partner_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_mck_partner(uuid, text, text, text, text, text, text, boolean, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_mck_partner(uuid, text, text, text, text, text, text, boolean, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_mck_events()
RETURNS TABLE (
  id uuid,
  title text,
  slug text,
  status text,
  starts_at timestamptz,
  programme_slug text
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_platform_staff('admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT e.id, e.title, e.slug, e.status::text, e.starts_at, e.programme_slug
  FROM public.events e
  ORDER BY e.starts_at DESC
  LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_mck_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_mck_events() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_mck_event_tag(
  p_event_id uuid,
  p_programme_slug text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_staff('admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_programme_slug IS NOT NULL AND p_programme_slug <> 'miss-corporate-kenya' THEN
    RAISE EXCEPTION 'invalid_programme_slug';
  END IF;

  UPDATE public.events
  SET programme_slug = p_programme_slug,
      updated_at = now()
  WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(), 'platform_staff', 'set_mck_event_programme_tag', 'event', p_event_id,
    jsonb_build_object('programme_slug', p_programme_slug)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_mck_event_tag(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_mck_event_tag(uuid, text) TO authenticated;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS programme_slug text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'events_programme_slug_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_programme_slug_check
      CHECK (programme_slug IS NULL OR programme_slug = 'miss-corporate-kenya');
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS events_programme_slug_status_starts_at_idx
  ON public.events (programme_slug, status, starts_at)
  WHERE programme_slug IS NOT NULL;

-- Preserve the existing safe public projection and append the new tag only.
CREATE OR REPLACE VIEW public.events_public
  WITH (security_barrier = true) AS
SELECT
  e.id, e.organisation_id, e.slug, e.title, e.description, e.status,
  e.cover_image_url, e.starts_at, e.ends_at, e.timezone, e.is_free,
  e.published_at, e.created_at, e.updated_at,
  e.category_id, c.slug AS category_slug, c.name AS category_name,
  e.venue_id, v.name AS venue_name, v.town AS venue_town, v.address AS venue_address,
  coalesce(o.trading_name, o.name) AS organiser_name,
  e.is_featured,
  e.programme_slug
FROM public.events e
JOIN public.categories c ON c.id = e.category_id
JOIN public.venues v ON v.id = e.venue_id
JOIN public.organisations o ON o.id = e.organisation_id
WHERE e.status IN ('published', 'sold_out');
GRANT SELECT ON public.events_public TO anon, authenticated;

COMMENT ON TABLE public.mck_partnership_tiers IS
  'Admin-managed MCK partnership packages; public reads expose active tiers only.';
COMMENT ON TABLE public.mck_corporate_partners IS
  'Admin-managed confirmed MCK partner records; public reads are limited to explicitly approved active records.';
COMMENT ON COLUMN public.events.programme_slug IS
  'Optional programme association used for Afriticket discovery; currently only miss-corporate-kenya is supported.';
COMMENT ON FUNCTION public.submit_corporate_partnership_enquiry(text, text, text, text, text, boolean, uuid, text) IS
  'Validates and rate-limits public partnership enquiry intake against active managed tiers; keeps a price/name snapshot and does not expose inserted PII.';
