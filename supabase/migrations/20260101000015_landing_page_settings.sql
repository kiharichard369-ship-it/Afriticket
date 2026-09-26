-- Ticketyangu — 0015: landing page settings, featured events, newsletter
--
-- site_settings is a deliberate singleton (one row, fixed id) rather than a
-- generic key-value table — the landing page needs to read all of it in one
-- query on every visit, and a singleton keeps that trivial and type-safe.
-- Public (anon) can read it, since the landing page itself is public;
-- only platform staff can write to it.

create table public.site_settings (
  id boolean primary key default true,
  wallpaper_url text,
  wallpaper_updated_by uuid references public.profiles (id),
  wallpaper_updated_at timestamptz,
  support_phone text,
  support_email text,
  currency text not null default 'KES',
  language text not null default 'English',
  hero_headline text,
  hero_subtitle text,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id)
);

insert into public.site_settings (id) values (true);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

create policy "site_settings: public read" on public.site_settings for select
  using (true);
create policy "site_settings: staff write" on public.site_settings for update
  using (public.is_platform_staff());

-- ── Featured events ────────────────────────────────────────────────────
alter table public.events add column is_featured boolean not null default false;

-- Staff-only column to set; reuse the existing organiser/staff update
-- policies on `events` for this (an organiser CAN'T set is_featured on
-- their own event this way — see the trigger below, same pattern as the
-- status-transition guard in migration 0009: RLS decides *who* can UPDATE
-- a row, not *which columns* they're allowed to change on it).
create function public.enforce_featured_flag_staff_only()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_featured <> old.is_featured and not public.is_platform_staff() then
    raise exception 'only platform staff can feature or unfeature an event';
  end if;
  return new;
end;
$$;

create trigger events_enforce_featured_flag
  before update of is_featured on public.events
  for each row execute function public.enforce_featured_flag_staff_only();

-- events_public (0012) needs rebuilding to include is_featured — Postgres's
-- CREATE OR REPLACE VIEW only allows *appending* columns, not inserting
-- them in the middle (it errors on changing an existing column's
-- position), so is_featured goes at the end of the list, not grouped
-- next to is_free where it would read more naturally.
create or replace view public.events_public as
select
  e.id, e.organisation_id, e.slug, e.title, e.description, e.status,
  e.cover_image_url, e.starts_at, e.ends_at, e.timezone, e.is_free,
  e.published_at, e.created_at, e.updated_at,
  e.category_id, c.slug as category_slug, c.name as category_name,
  e.venue_id, v.name as venue_name, v.town as venue_town, v.address as venue_address,
  coalesce(o.trading_name, o.name) as organiser_name,
  e.is_featured
from public.events e
join public.categories c on c.id = e.category_id
join public.venues v on v.id = e.venue_id
join public.organisations o on o.id = e.organisation_id
where e.status in ('published', 'sold_out');

grant select on public.events_public to anon, authenticated;

-- ── Newsletter subscribers ────────────────────────────────────────────────
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  interests text[] not null default '{}',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

alter table public.newsletter_subscribers enable row level security;

-- Anyone can subscribe themselves; nobody (not even authenticated buyers)
-- can read the list back through the API — that's a staff/export-only
-- concern, kept out of the public API surface entirely on purpose.
create policy "newsletter: anyone can subscribe" on public.newsletter_subscribers for insert
  with check (true);
create policy "newsletter: staff can read" on public.newsletter_subscribers for select
  using (public.is_platform_staff());

grant insert on public.newsletter_subscribers to anon, authenticated;
