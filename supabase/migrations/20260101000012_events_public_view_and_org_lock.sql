-- Ticketyangu — 0012: security hardening pass (OWASP API Top 10 review)
--
-- Found by testing: SupabaseEventsRepository selects `select *` on
-- `events`, and the public RLS policy allows that regardless of which
-- columns are asked for — RLS filters rows, not columns. That means
-- moderation_reason (an organiser-private note from a staff review — e.g.
-- "photo looks unlicensed, verify before republishing") was readable by
-- anon on every published/sold_out event. The architecture guide's own
-- rule — "Search results should not expose organiser-private notes" — was
-- being violated. Fixed the same way ticket_types_public already fixed the
-- equivalent problem for capacity: a public view exposing only safe
-- columns, with the frontend repository switched to query it instead of
-- the raw table for anything buyer-facing. The organiser dashboard and
-- admin moderation queries still read the raw `events` table directly,
-- which is correct — they're allowed to see moderation_reason.

-- Flattened, not embedded: PostgREST's automatic resource embedding
-- (category:categories(*)) is detected from real foreign-key constraints
-- on TABLES. A view has no FK constraints of its own, so embedding
-- through a view is unreliable — it can silently stop working depending
-- on PostgREST version/schema-cache behavior, which is exactly the kind
-- of thing that passes local testing against raw Postgres (no PostgREST
-- in this test harness) and only breaks once it hits a real Supabase
-- project. Flattening the join into plain columns sidesteps the problem
-- entirely: no embedding required, so nothing to silently break.
create view public.events_public as
select
  e.id, e.organisation_id, e.slug, e.title, e.description, e.status,
  e.cover_image_url, e.starts_at, e.ends_at, e.timezone, e.is_free,
  e.published_at, e.created_at, e.updated_at,
  e.category_id, c.slug as category_slug, c.name as category_name,
  e.venue_id, v.name as venue_name, v.town as venue_town, v.address as venue_address,
  coalesce(o.trading_name, o.name) as organiser_name
from public.events e
join public.categories c on c.id = e.category_id
join public.venues v on v.id = e.venue_id
join public.organisations o on o.id = e.organisation_id
where e.status in ('published', 'sold_out');

grant select on public.events_public to anon, authenticated;

-- ── Defense in depth: an event can't be reassigned to a different org ────
-- The "organisers update own" policy from migration 0007 has no WITH CHECK
-- of its own, so Postgres implicitly reuses its USING clause as the check
-- — which happens to block moving an event to an org the caller doesn't
-- belong to, but only incidentally. Making it an explicit trigger is
-- clearer than relying on that side effect, and also stops an organiser
-- moving an event between two orgs they legitimately belong to, which has
-- no valid product reason and would scramble that event's audit history.
create function public.prevent_event_org_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.organisation_id <> old.organisation_id and not public.is_platform_staff() then
    raise exception 'events cannot be moved between organisations';
  end if;
  return new;
end;
$$;

create trigger events_prevent_org_reassignment
  before update of organisation_id on public.events
  for each row execute function public.prevent_event_org_reassignment();
