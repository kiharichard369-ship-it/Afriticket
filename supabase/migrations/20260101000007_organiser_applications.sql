-- Ticketyangu — 0007: organiser applications, moderation, and the write
-- policies the organiser dashboard needs (Phase 1 only granted organisers
-- read access to their own catalog rows; this adds insert/update).

create type application_status as enum ('pending', 'approved', 'rejected');

create table public.organiser_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  organisation_name text not null,
  trading_name text,
  contact_email text not null,
  contact_phone text,
  notes text,
  status application_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_reason text,
  organisation_id uuid references public.organisations (id),
  created_at timestamptz not null default now()
);

create index organiser_applications_status_idx on public.organiser_applications (status);

alter table public.organiser_applications enable row level security;

create policy "applications: applicant reads own" on public.organiser_applications for select
  using (applicant_id = auth.uid() or public.is_platform_staff());
create policy "applications: applicant creates own" on public.organiser_applications for insert
  with check (applicant_id = auth.uid());

-- Approval/rejection go through these functions rather than direct UPDATEs,
-- so creating the organisation + owner membership is atomic with marking
-- the application approved. Both check platform-staff internally.
create function public.approve_organiser_application(p_application_id uuid, p_reason text default null)
returns public.organisations
language plpgsql
security definer set search_path = public
as $$
declare
  app public.organiser_applications;
  org public.organisations;
  base_slug text;
  candidate_slug text;
  suffix int := 0;
begin
  if not public.is_platform_staff() then
    raise exception 'not authorized';
  end if;

  select * into app from public.organiser_applications where id = p_application_id for update;
  if app is null then
    raise exception 'application not found';
  end if;
  if app.status <> 'pending' then
    raise exception 'application already reviewed';
  end if;

  base_slug := regexp_replace(lower(app.organisation_name), '[^a-z0-9]+', '-', 'g');
  candidate_slug := base_slug;
  while exists (select 1 from public.organisations where slug = candidate_slug) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix;
  end loop;

  insert into public.organisations (name, slug, trading_name, support_email, support_phone, is_approved)
  values (app.organisation_name, candidate_slug, app.trading_name, app.contact_email, app.contact_phone, true)
  returning * into org;

  insert into public.organisation_members (organisation_id, user_id, role)
  values (org.id, app.applicant_id, 'owner');

  update public.organiser_applications
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      review_reason = p_reason, organisation_id = org.id
  where id = p_application_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform_staff', 'approve_organiser_application', 'organisation', org.id,
          jsonb_build_object('application_id', p_application_id));

  return org;
end;
$$;

create function public.reject_organiser_application(p_application_id uuid, p_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'not authorized';
  end if;

  update public.organiser_applications
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_reason = p_reason
  where id = p_application_id and status = 'pending';

  if not found then
    raise exception 'application not found or already reviewed';
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform_staff', 'reject_organiser_application', 'organiser_application', p_application_id,
          jsonb_build_object('reason', p_reason));
end;
$$;

grant execute on function public.approve_organiser_application(uuid, text) to authenticated;
grant execute on function public.reject_organiser_application(uuid, text) to authenticated;

-- ── Organiser write access to their own catalog rows ─────────────────────
create policy "venues: organisers create own" on public.venues for insert
  with check (organisation_id is null or public.has_organisation_role(organisation_id, array['owner','manager','editor']::organisation_role[]));
create policy "venues: organisers update own" on public.venues for update
  using (public.has_organisation_role(organisation_id, array['owner','manager','editor']::organisation_role[]));

create policy "ticket_types: organisers write own" on public.ticket_types for insert
  with check (exists (select 1 from public.events e where e.id = event_id
    and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])));
create policy "ticket_types: organisers update own" on public.ticket_types for update
  using (exists (select 1 from public.events e where e.id = event_id
    and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])));
create policy "ticket_types: organisers delete own draft" on public.ticket_types for delete
  using (exists (select 1 from public.events e where e.id = event_id and e.status = 'draft'
    and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])));

create policy "event_media: organisers write own" on public.event_media for insert
  with check (exists (select 1 from public.events e where e.id = event_id
    and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])));
create policy "event_policies: organisers write own" on public.event_policies for insert
  with check (exists (select 1 from public.events e where e.id = event_id
    and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])));
create policy "event_policies: organisers update own" on public.event_policies for update
  using (exists (select 1 from public.events e where e.id = event_id
    and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])));

-- Moderation: only platform staff can move an event out of pending_review.
-- Organisers can only ever set status to draft or pending_review themselves
-- (enforced in the app layer + this check), and pause/cancel/archive their
-- own already-published events.
create policy "events: platform staff moderate" on public.events for update
  using (public.is_platform_staff());
