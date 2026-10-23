-- Location: supabase/migrations/20260101000031_event_partnerships.sql
-- Event-specific partnership packages, applications, verified M-Pesa payments,
-- and a public projection that never exposes applicant contact details.
-- This migration is additive and does not reuse ticket orders or ticket issuance.

create table public.event_partnership_packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  name text not null,
  service_description text not null,
  price_kes integer not null check (price_kes between 1 and 10000000),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_partnership_package_text_lengths check (
    char_length(btrim(category)) between 2 and 80
    and char_length(btrim(name)) between 2 and 120
    and char_length(btrim(service_description)) between 5 and 1200
  )
);

create index event_partnership_packages_event_active_idx
  on public.event_partnership_packages(event_id, is_active, sort_order, name);

create trigger event_partnership_packages_set_updated_at
  before update on public.event_partnership_packages
  for each row execute function public.set_updated_at();

create table public.event_partnership_applications (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  idempotency_key uuid not null unique,
  event_id uuid not null references public.events(id) on delete restrict,
  package_id uuid not null references public.event_partnership_packages(id) on delete restrict,
  package_name_snapshot text not null,
  category_snapshot text not null,
  service_description_snapshot text not null,
  price_kes_snapshot integer not null check (price_kes_snapshot > 0),
  amount_minor_snapshot bigint not null check (amount_minor_snapshot > 0),
  applicant_name text not null,
  business_name text not null,
  contact_email text not null,
  contact_phone text not null,
  offered_services text not null,
  logo_path text,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'cancelled')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint event_partnership_application_text_lengths check (
    char_length(applicant_name) between 2 and 120
    and char_length(business_name) between 2 and 160
    and char_length(contact_email) between 5 and 254
    and char_length(contact_phone) between 8 and 16
    and char_length(offered_services) between 10 and 2000
    and char_length(package_name_snapshot) between 2 and 120
    and char_length(category_snapshot) between 2 and 80
    and char_length(service_description_snapshot) between 5 and 1200
  )
);

create index event_partnership_applications_event_paid_idx
  on public.event_partnership_applications(event_id, confirmed_at desc)
  where status = 'paid' and is_public;
create index event_partnership_applications_package_idx
  on public.event_partnership_applications(package_id, created_at desc);
create index event_partnership_applications_status_idx
  on public.event_partnership_applications(status, created_at desc);

create table public.event_partnership_payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.event_partnership_applications(id) on delete restrict,
  provider text not null default 'mpesa' check (provider = 'mpesa'),
  provider_reference text,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'initiated'
    check (status in ('initiated', 'pending', 'succeeded', 'failed')),
  mpesa_receipt_number text,
  failure_reason text,
  initiated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index event_partnership_payment_provider_reference_idx
  on public.event_partnership_payments(provider, provider_reference)
  where provider_reference is not null;
create unique index event_partnership_one_open_payment_idx
  on public.event_partnership_payments(application_id)
  where status in ('initiated', 'pending');
create index event_partnership_payments_application_idx
  on public.event_partnership_payments(application_id, initiated_at desc);

alter table public.event_partnership_packages enable row level security;
alter table public.event_partnership_applications enable row level security;
alter table public.event_partnership_payments enable row level security;

revoke all on public.event_partnership_packages from public, anon, authenticated;
revoke all on public.event_partnership_applications from public, anon, authenticated;
revoke all on public.event_partnership_payments from public, anon, authenticated;
grant all on public.event_partnership_packages to service_role;
grant all on public.event_partnership_applications to service_role;
grant all on public.event_partnership_payments to service_role;
grant execute on function public.check_rate_limit(text, integer, interval) to service_role;

create policy event_partnership_packages_admin_read
  on public.event_partnership_packages for select to authenticated
  using (public.is_platform_staff('admin'));
create policy event_partnership_applications_admin_read
  on public.event_partnership_applications for select to authenticated
  using (public.is_platform_staff('admin'));
create policy event_partnership_payments_admin_read
  on public.event_partnership_payments for select to authenticated
  using (public.is_platform_staff('admin'));

create view public.event_partnership_packages_public as
select
  p.id,
  p.event_id,
  p.category,
  p.name,
  p.service_description,
  p.price_kes,
  p.sort_order
from public.event_partnership_packages p
join public.events e on e.id = p.event_id
where p.is_active
  and e.status in ('published', 'sold_out');
grant select on public.event_partnership_packages_public to anon, authenticated;

create view public.event_partners_public as
select
  a.id,
  a.event_id,
  a.business_name as partner_name,
  a.package_name_snapshot as package_name,
  a.category_snapshot as category,
  a.offered_services,
  a.logo_path,
  a.confirmed_at
from public.event_partnership_applications a
join public.events e on e.id = a.event_id
where a.status = 'paid'
  and a.is_public
  and e.status in ('published', 'sold_out');
grant select on public.event_partners_public to anon, authenticated;

create function public.submit_event_partnership_application(
  p_package_id uuid,
  p_idempotency_key uuid,
  p_applicant_name text,
  p_business_name text,
  p_contact_email text,
  p_contact_phone text,
  p_offered_services text,
  p_honeypot text default ''
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_package public.event_partnership_packages;
  v_event_status text;
  v_id uuid;
  v_reference text;
  v_name text := btrim(coalesce(p_applicant_name, ''));
  v_business text := btrim(coalesce(p_business_name, ''));
  v_email text := lower(btrim(coalesce(p_contact_email, '')));
  v_phone text := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g');
  v_services text := btrim(coalesce(p_offered_services, ''));
begin
  if coalesce(p_honeypot, '') <> '' then
    raise exception 'invalid_submission';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;
  select * into v_package
  from public.event_partnership_packages
  where id = p_package_id and is_active
  for share;
  if v_package.id is null then
    raise exception 'partnership_package_unavailable';
  end if;
  select status::text into v_event_status from public.events where id = v_package.event_id;
  if v_event_status not in ('published', 'sold_out') then
    raise exception 'event_not_available';
  end if;
  if char_length(v_name) not between 2 and 120
     or char_length(v_business) not between 2 and 160
     or char_length(v_email) not between 5 and 254
     or v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
     or char_length(v_phone) not between 8 and 16
     or char_length(v_services) not between 10 and 2000 then
    raise exception 'invalid_application_details';
  end if;
  select id into v_id from public.event_partnership_applications where idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;
  if not public.check_rate_limit('event_partnership_application:' || md5(v_email), 5, interval '1 day') then
    raise exception 'rate_limited: too many partnership applications';
  end if;
  v_reference := 'EP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.event_partnership_applications (
    public_reference, idempotency_key, event_id, package_id,
    package_name_snapshot, category_snapshot, service_description_snapshot,
    price_kes_snapshot, amount_minor_snapshot,
    applicant_name, business_name, contact_email, contact_phone, offered_services
  ) values (
    v_reference, p_idempotency_key, v_package.event_id, v_package.id,
    v_package.name, v_package.category, v_package.service_description,
    v_package.price_kes, v_package.price_kes::bigint * 100,
    v_name, v_business, v_email, v_phone, v_services
  ) on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.event_partnership_applications where idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;
revoke all on function public.submit_event_partnership_application(uuid, uuid, text, text, text, text, text, text)
  from public;
grant execute on function public.submit_event_partnership_application(uuid, uuid, text, text, text, text, text, text)
  to anon, authenticated;

create function public.admin_list_event_partnership_events()
returns table (id uuid, title text, slug text, status text, starts_at timestamptz)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;
  return query
  select e.id, e.title, e.slug, e.status::text, e.starts_at
  from public.events e
  order by e.starts_at desc, e.title
  limit 1000;
end;
$$;
revoke all on function public.admin_list_event_partnership_events() from public, anon, authenticated;
grant execute on function public.admin_list_event_partnership_events() to authenticated;

create function public.admin_list_event_partnership_packages(p_event_id uuid)
returns table (
  id uuid, event_id uuid, category text, name text, service_description text,
  price_kes integer, sort_order integer, is_active boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;
  return query
  select p.id, p.event_id, p.category, p.name, p.service_description,
         p.price_kes, p.sort_order, p.is_active, p.created_at, p.updated_at
  from public.event_partnership_packages p
  where p.event_id = p_event_id
  order by p.sort_order, p.name;
end;
$$;
revoke all on function public.admin_list_event_partnership_packages(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_event_partnership_packages(uuid) to authenticated;

create function public.admin_save_event_partnership_package(
  p_package_id uuid,
  p_event_id uuid,
  p_category text,
  p_name text,
  p_service_description text,
  p_price_kes integer,
  p_sort_order integer,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_category text := btrim(coalesce(p_category, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_services text := btrim(coalesce(p_service_description, ''));
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;
  if p_event_id is null or not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'event_not_found';
  end if;
  if char_length(v_category) not between 2 and 80
     or char_length(v_name) not between 2 and 120
     or char_length(v_services) not between 5 and 1200
     or p_price_kes is null or p_price_kes not between 1 and 10000000
     or p_sort_order is null or p_sort_order not between 0 and 10000
     or p_is_active is null then
    raise exception 'invalid_package_details';
  end if;
  if p_package_id is null then
    insert into public.event_partnership_packages (
      event_id, category, name, service_description, price_kes, sort_order, is_active, created_by
    ) values (
      p_event_id, v_category, v_name, v_services, p_price_kes, p_sort_order, p_is_active, auth.uid()
    ) returning id into v_id;
  else
    update public.event_partnership_packages
    set category = v_category,
        name = v_name,
        service_description = v_services,
        price_kes = p_price_kes,
        sort_order = p_sort_order,
        is_active = p_is_active
    where id = p_package_id and event_id = p_event_id
    returning id into v_id;
    if v_id is null then
      raise exception 'package_not_found_for_event';
    end if;
  end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    auth.uid(), 'platform_staff', 'manage_event_partnership_package', 'event_partnership_package', v_id,
    jsonb_build_object('event_id', p_event_id, 'category', v_category, 'price_kes', p_price_kes, 'is_active', p_is_active)
  );
  return v_id;
end;
$$;
revoke all on function public.admin_save_event_partnership_package(uuid, uuid, text, text, text, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_save_event_partnership_package(uuid, uuid, text, text, text, integer, integer, boolean)
  to authenticated;

create function public.admin_list_event_partnership_applications(p_event_id uuid default null)
returns table (
  id uuid, event_id uuid, event_title text, public_reference text,
  applicant_name text, business_name text, contact_email text, contact_phone text,
  category text, package_name text, price_kes integer, offered_services text,
  logo_path text, status text, is_public boolean, created_at timestamptz, confirmed_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;
  return query
  select a.id, a.event_id, e.title, a.public_reference,
         a.applicant_name, a.business_name, a.contact_email, a.contact_phone,
         a.category_snapshot, a.package_name_snapshot, a.price_kes_snapshot, a.offered_services,
         a.logo_path, a.status, a.is_public, a.created_at, a.confirmed_at
  from public.event_partnership_applications a
  join public.events e on e.id = a.event_id
  where p_event_id is null or a.event_id = p_event_id
  order by a.created_at desc
  limit 1000;
end;
$$;
revoke all on function public.admin_list_event_partnership_applications(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_event_partnership_applications(uuid) to authenticated;

create function public.admin_set_event_partnership_public(p_application_id uuid, p_is_public boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_app public.event_partnership_applications;
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;
  if p_is_public is null then
    raise exception 'invalid_listing_state';
  end if;
  select * into v_app from public.event_partnership_applications where id = p_application_id for update;
  if v_app.id is null or v_app.status <> 'paid' then
    raise exception 'only_confirmed_partners_can_be_listed';
  end if;
  update public.event_partnership_applications set is_public = p_is_public where id = p_application_id;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform_staff', 'set_event_partnership_public', 'event_partnership_application', p_application_id,
          jsonb_build_object('is_public', p_is_public));
end;
$$;
revoke all on function public.admin_set_event_partnership_public(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_event_partnership_public(uuid, boolean) to authenticated;

create function public.set_event_partnership_logo_path(p_application_id uuid, p_logo_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_logo_path is null or char_length(p_logo_path) > 300
     or p_logo_path !~ ('^' || p_application_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_logo_path';
  end if;
  update public.event_partnership_applications
  set logo_path = p_logo_path
  where id = p_application_id and status = 'awaiting_payment' and logo_path is null;
  if not found then
    raise exception 'application_not_uploadable';
  end if;
end;
$$;
revoke all on function public.set_event_partnership_logo_path(uuid, text) from public, anon, authenticated;
grant execute on function public.set_event_partnership_logo_path(uuid, text) to service_role;

create function public.create_event_partnership_payment_attempt(p_application_id uuid)
returns public.event_partnership_payments
language plpgsql
security definer set search_path = public
as $$
declare
  v_app public.event_partnership_applications;
  v_payment public.event_partnership_payments;
begin
  select * into v_app from public.event_partnership_applications where id = p_application_id for update;
  if v_app.id is null or v_app.status = 'cancelled' then
    raise exception 'application_not_payable';
  end if;
  if v_app.status = 'paid' then
    raise exception 'application_already_paid';
  end if;
  select * into v_payment
  from public.event_partnership_payments
  where application_id = p_application_id and status in ('initiated', 'pending')
  order by initiated_at desc limit 1;
  if v_payment.id is not null then
    if v_payment.status = 'pending' then
      return v_payment;
    end if;
    if v_payment.initiated_at > now() - interval '3 minutes' then
      raise exception 'payment_initiation_in_progress';
    end if;
    update public.event_partnership_payments
    set status = 'failed', failure_reason = 'stale initiation reservation'
    where id = v_payment.id;
  end if;
  insert into public.event_partnership_payments (application_id, amount_minor, status)
  values (p_application_id, v_app.amount_minor_snapshot, 'initiated')
  returning * into v_payment;
  return v_payment;
end;
$$;
revoke all on function public.create_event_partnership_payment_attempt(uuid) from public, anon, authenticated;
grant execute on function public.create_event_partnership_payment_attempt(uuid) to service_role;

create function public.record_event_partnership_payment_initiation(p_payment_id uuid, p_provider_reference text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_provider_reference is null or char_length(btrim(p_provider_reference)) not between 1 and 160 then
    raise exception 'invalid_provider_reference';
  end if;
  update public.event_partnership_payments
  set provider_reference = btrim(p_provider_reference), status = 'pending'
  where id = p_payment_id and provider = 'mpesa' and status = 'initiated';
  if not found and not exists (
    select 1 from public.event_partnership_payments
    where id = p_payment_id and provider_reference = btrim(p_provider_reference) and status = 'pending'
  ) then
    raise exception 'payment_attempt_not_initiated';
  end if;
end;
$$;
revoke all on function public.record_event_partnership_payment_initiation(uuid, text) from public, anon, authenticated;
grant execute on function public.record_event_partnership_payment_initiation(uuid, text) to service_role;

create function public.confirm_event_partnership_payment(
  p_payment_id uuid,
  p_receipt text default null,
  p_reported_amount_minor bigint default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_payment public.event_partnership_payments;
  v_app public.event_partnership_applications;
begin
  select * into v_payment from public.event_partnership_payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;
  select * into v_app from public.event_partnership_applications where id = v_payment.application_id for update;
  if v_app.id is null then
    raise exception 'application_not_found';
  end if;
  if v_payment.status = 'succeeded' and v_app.status = 'paid' then
    return v_app.id;
  end if;
  if v_payment.status not in ('initiated', 'pending') then
    raise exception 'payment_not_confirmable';
  end if;
  if v_payment.amount_minor <> v_app.amount_minor_snapshot then
    raise exception 'payment_amount_mismatch';
  end if;
  if p_reported_amount_minor is not null and p_reported_amount_minor <> v_payment.amount_minor then
    raise exception 'provider_reported_amount_mismatch';
  end if;
  update public.event_partnership_payments
  set status = 'succeeded', confirmed_at = now(),
      mpesa_receipt_number = nullif(btrim(coalesce(p_receipt, '')), '')
  where id = p_payment_id;
  update public.event_partnership_applications
  set status = 'paid', is_public = true, confirmed_at = coalesce(confirmed_at, now())
  where id = v_app.id;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'confirm_event_partnership_payment', 'event_partnership_application', v_app.id,
          jsonb_build_object('payment_id', p_payment_id, 'amount_minor', v_payment.amount_minor,
                             'provider_reference', v_payment.provider_reference));
  return v_app.id;
end;
$$;
revoke all on function public.confirm_event_partnership_payment(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_event_partnership_payment(uuid, text, bigint) to service_role;

create function public.fail_event_partnership_payment(p_payment_id uuid, p_reason text default 'payment failed')
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.event_partnership_payments
  set status = 'failed', failure_reason = left(coalesce(nullif(btrim(p_reason), ''), 'payment failed'), 500)
  where id = p_payment_id and status in ('initiated', 'pending');
end;
$$;
revoke all on function public.fail_event_partnership_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_event_partnership_payment(uuid, text) to service_role;

create function public.is_visible_event_partnership_logo(p_object_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.event_partnership_applications a
    where a.logo_path = p_object_name and a.status = 'paid' and a.is_public
  );
$$;
revoke all on function public.is_visible_event_partnership_logo(text) from public;
grant execute on function public.is_visible_event_partnership_logo(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-partner-logos', 'event-partner-logos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy event_partner_logos_read_confirmed
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-partner-logos' and public.is_visible_event_partnership_logo(name));
-- Upload tokens are minted by the service-role-only logo-upload Edge Function;
-- no direct browser INSERT/UPDATE/DELETE policy is granted for this bucket.

notify pgrst, 'reload schema';
