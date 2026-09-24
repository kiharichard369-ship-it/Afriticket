-- Ticketyangu — 0006: Row Level Security
-- Default posture: RLS on everywhere, deny by default. Writes to money- and
-- inventory-bearing tables happen through Edge Functions using the service
-- role (which bypasses RLS), never directly from the browser.

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.platform_staff enable row level security;
alter table public.categories enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_media enable row level security;
alter table public.event_policies enable row level security;
alter table public.ticket_types enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.inventory_holds enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.refunds enable row level security;
alter table public.tickets enable row level security;
alter table public.checkins enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- ── Identity ────────────────────────────────────────────────────────────
create policy "profiles: read own" on public.profiles for select
  using (id = auth.uid() or public.is_platform_staff());
create policy "profiles: update own" on public.profiles for update
  using (id = auth.uid());

create policy "organisations: members read own" on public.organisations for select
  using (
    public.has_organisation_role(id, array['owner','manager','editor','finance','checkin_staff']::organisation_role[])
    or public.is_platform_staff()
  );
create policy "organisations: owners update own" on public.organisations for update
  using (public.has_organisation_role(id, array['owner']::organisation_role[]));

create policy "organisation_members: read own membership" on public.organisation_members for select
  using (user_id = auth.uid() or public.has_organisation_role(organisation_id, array['owner','manager']::organisation_role[]));

create policy "platform_staff: self read" on public.platform_staff for select
  using (user_id = auth.uid());

-- ── Public catalog ──────────────────────────────────────────────────────
create policy "categories: public read" on public.categories for select using (true);
create policy "venues: public read" on public.venues for select using (true);

create policy "events: public read published" on public.events for select
  using (status in ('published', 'sold_out'));
create policy "events: organisers read own" on public.events for select
  using (public.has_organisation_role(organisation_id, array['owner','manager','editor','finance','checkin_staff']::organisation_role[]));
create policy "events: organisers manage own" on public.events for insert
  with check (public.has_organisation_role(organisation_id, array['owner','manager','editor']::organisation_role[]));
create policy "events: organisers update own" on public.events for update
  using (public.has_organisation_role(organisation_id, array['owner','manager','editor']::organisation_role[]));

create policy "event_sessions: public read of published events" on public.event_sessions for select
  using (exists (select 1 from public.events e where e.id = event_id and e.status in ('published','sold_out')));
create policy "event_media: public read approved media of published events" on public.event_media for select
  using (approved and exists (select 1 from public.events e where e.id = event_id and e.status in ('published','sold_out')));
create policy "event_policies: public read of published events" on public.event_policies for select
  using (exists (select 1 from public.events e where e.id = event_id and e.status in ('published','sold_out')));

-- Raw ticket_types (with real capacity) is organiser/staff-only. The public
-- app reads the ticket_types_public view instead, which hides capacity.
create policy "ticket_types: organisers read own" on public.ticket_types for select
  using (exists (
    select 1 from public.events e
    where e.id = event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','editor','finance']::organisation_role[])
  ));

create view public.ticket_types_public as
select
  tt.id, tt.event_id, tt.name, tt.description, tt.price_minor, tt.currency,
  tt.per_order_limit, tt.sales_start_at, tt.sales_end_at,
  greatest(a.remaining, 0) as remaining
from public.ticket_types tt
join public.ticket_type_availability a on a.ticket_type_id = tt.id
join public.events e on e.id = tt.event_id
where e.status in ('published', 'sold_out');

grant select on public.ticket_types_public to anon, authenticated;
grant select on public.ticket_type_availability to authenticated;

-- ── Orders, payments, tickets: buyer- and organiser-scoped reads only ────
create policy "orders: buyer reads own" on public.orders for select
  using (buyer_id = auth.uid());
create policy "orders: organiser reads own event orders" on public.orders for select
  using (exists (
    select 1 from public.events e
    where e.id = event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','finance']::organisation_role[])
  ));

create policy "order_items: follow parent order" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and (
    o.buyer_id = auth.uid()
    or exists (select 1 from public.events e where e.id = o.event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','finance']::organisation_role[]))
  )));

create policy "payments: follow parent order" on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and (
    o.buyer_id = auth.uid()
    or exists (select 1 from public.events e where e.id = o.event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','finance']::organisation_role[]))
  )));

create policy "refunds: follow parent order" on public.refunds for select
  using (exists (select 1 from public.orders o where o.id = order_id and (
    o.buyer_id = auth.uid()
    or exists (select 1 from public.events e where e.id = o.event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','finance']::organisation_role[]))
  )));

create policy "tickets: buyer reads own" on public.tickets for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy "tickets: checkin staff read event tickets" on public.tickets for select
  using (exists (
    select 1 from public.events e
    where e.id = event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','checkin_staff']::organisation_role[])
  ));

create policy "checkins: staff read own event" on public.checkins for select
  using (exists (
    select 1 from public.tickets t join public.events e on e.id = t.event_id
    where t.id = ticket_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','checkin_staff']::organisation_role[])
  ));

create policy "notifications: recipient reads own" on public.notifications for select
  using (recipient_profile_id = auth.uid());

create policy "audit_logs: platform staff only" on public.audit_logs for select
  using (public.is_platform_staff());

-- inventory_ledger, inventory_holds and payment_webhook_events have RLS
-- enabled with no policies at all: nothing is readable or writable from the
-- anon/authenticated roles. Only the service role (used by Edge Functions)
-- can touch them, since the service role bypasses RLS entirely.
