-- Ticketyangu — demo seed data (non-sensitive, safe for any environment)
-- Run this after all migrations. It creates categories, one demo
-- organisation, venues, and a couple of published events with ticket types,
-- so the Phase 2 SupabaseEventsRepository has something real to query.

insert into public.categories (slug, name, sort_order) values
  ('music', 'Music', 1),
  ('nightlife', 'Nightlife', 2),
  ('arts-theatre', 'Arts & Theatre', 3),
  ('comedy', 'Comedy', 4),
  ('sports', 'Sports', 5),
  ('business', 'Conferences & Business', 6),
  ('culture', 'Community & Culture', 7),
  ('family', 'Family & Kids', 8)
on conflict (slug) do nothing;

insert into public.organisations (id, name, slug, trading_name, support_email, is_approved)
values ('00000000-0000-0000-0000-000000000001', 'Mirie Technologies Events', 'mirie-events', 'Ticketyangu Demo Organiser', 'events@mirie.co.ke', true)
on conflict (id) do nothing;

insert into public.venues (id, organisation_id, name, town, address) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Nakuru Athletic Grounds', 'Nakuru', 'Off Oginga Odinga Rd'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'The Playhouse Nakuru', 'Nakuru', 'Kenyatta Ave')
on conflict (id) do nothing;

insert into public.events (
  id, organisation_id, category_id, venue_id, slug, title, description, status,
  starts_at, ends_at, is_free, published_at
)
select
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000001',
  c.id,
  '00000000-0000-0000-0000-000000000011',
  'rift-valley-sound-festival',
  'Rift Valley Sound Festival',
  'A full-day outdoor lineup of Kenyan Afrobeat, benga revival, and genge acts on three stages.',
  'published',
  now() + interval '12 days',
  now() + interval '12 days 8 hours',
  false,
  now()
from public.categories c where c.slug = 'music'
on conflict (id) do nothing;

insert into public.ticket_types (event_id, name, price_minor, currency, capacity, per_order_limit) values
  ('00000000-0000-0000-0000-000000000021', 'Early Bird', 150000, 'KES', 500, 6),
  ('00000000-0000-0000-0000-000000000021', 'Regular', 220000, 'KES', 2000, 8),
  ('00000000-0000-0000-0000-000000000021', 'VIP Deck', 550000, 'KES', 200, 4)
on conflict do nothing;
