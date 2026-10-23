-- Afriticket — 0027: MCK corporate partnership enquiries
-- Location: supabase/migrations/20260101000027_corporate_partnership_enquiries.sql
-- Additive only: this migration does not alter events, orders, inventory,
-- payments, ticket issuance, or existing organiser application records.
-- Apply after migrations 0001–0026. Public intake is execute-only; submitted
-- PII is never selectable by anon callers. Admin review uses the established
-- platform_staff role boundary and writes a non-PII audit record.

create table if not exists public.corporate_partnership_enquiries (
  id uuid primary key default gen_random_uuid(),
  organisation_name text not null
    check (char_length(btrim(organisation_name)) between 2 and 160),
  contact_email text not null
    check (char_length(contact_email) between 5 and 254)
    check (contact_email = lower(btrim(contact_email)))
    check (contact_email !~ '[[:space:]]')
    check (contact_email like '%_@_%._%'),
  partnership_type text not null
    check (partnership_type in ('cash', 'in_kind')),
  tier_key text
    check (tier_key is null or tier_key in ('supporting', 'impact', 'leadership', 'strategic-impact')),
  message text
    check (message is null or char_length(message) <= 2000),
  consent_to_contact boolean not null check (consent_to_contact is true),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'contacted', 'closed', 'spam')),
  admin_notes text
    check (admin_notes is null or char_length(admin_notes) <= 2000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corporate_partnership_enquiries_kind_tier_check check (
    (partnership_type = 'cash' and tier_key is not null)
    or (partnership_type = 'in_kind' and tier_key is null)
  )
);

create index if not exists corporate_partnership_enquiries_created_at_idx
  on public.corporate_partnership_enquiries (created_at desc);
create index if not exists corporate_partnership_enquiries_status_created_at_idx
  on public.corporate_partnership_enquiries (status, created_at desc);

alter table public.corporate_partnership_enquiries enable row level security;

-- No direct INSERT, UPDATE or DELETE grants are given to browser roles.
-- Anonymous intake is performed through the narrow validation RPC below.
revoke all on table public.corporate_partnership_enquiries from public, anon, authenticated;
grant select on table public.corporate_partnership_enquiries to authenticated;

drop policy if exists "corporate partnership enquiries: administrators read"
  on public.corporate_partnership_enquiries;
create policy "corporate partnership enquiries: administrators read"
  on public.corporate_partnership_enquiries for select to authenticated
  using (public.is_platform_staff('admin'));

create or replace function public.submit_corporate_partnership_enquiry(
  p_organisation_name text,
  p_contact_email text,
  p_partnership_type text,
  p_tier_key text,
  p_message text,
  p_consent_to_contact boolean,
  p_rate_limit_key uuid,
  p_website text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_organisation_name text := btrim(coalesce(p_organisation_name, ''));
  v_contact_email text := lower(btrim(coalesce(p_contact_email, '')));
  v_partnership_type text := lower(btrim(coalesce(p_partnership_type, '')));
  v_tier_key text := nullif(lower(btrim(coalesce(p_tier_key, ''))), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_enquiry_id uuid;
begin
  -- Honeypot: return normally without saving so simple bots do not learn the field.
  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    return null;
  end if;

  if p_consent_to_contact is distinct from true then
    raise exception 'consent_required';
  end if;
  if char_length(v_organisation_name) not between 2 and 160 then
    raise exception 'invalid_organisation_name';
  end if;
  if char_length(v_contact_email) not between 5 and 254
     or v_contact_email not like '%_@_%._%'
     or v_contact_email ~ '[[:space:]]' then
    raise exception 'invalid_contact_email';
  end if;
  if v_message is not null and char_length(v_message) > 2000 then
    raise exception 'message_too_long';
  end if;
  if v_partnership_type = 'cash' then
    if v_tier_key is null or v_tier_key not in ('supporting', 'impact', 'leadership', 'strategic-impact') then
      raise exception 'invalid_partnership_tier';
    end if;
  elsif v_partnership_type = 'in_kind' then
    if v_tier_key is not null then
      raise exception 'in_kind_has_no_cash_tier';
    end if;
  else
    raise exception 'invalid_partnership_type';
  end if;
  if p_rate_limit_key is null then
    raise exception 'rate_limit_key_required';
  end if;
  if not public.check_rate_limit(
    'corporate_partnership_enquiry:' || p_rate_limit_key::text,
    3,
    interval '1 hour'
  ) then
    raise exception 'rate_limited: please wait before submitting another enquiry';
  end if;

  insert into public.corporate_partnership_enquiries (
    organisation_name,
    contact_email,
    partnership_type,
    tier_key,
    message,
    consent_to_contact
  ) values (
    v_organisation_name,
    v_contact_email,
    v_partnership_type,
    v_tier_key,
    v_message,
    true
  ) returning id into v_enquiry_id;

  return v_enquiry_id;
end;
$$;

revoke all on function public.submit_corporate_partnership_enquiry(text, text, text, text, text, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.submit_corporate_partnership_enquiry(text, text, text, text, text, boolean, uuid, text)
  to anon, authenticated;

create or replace function public.set_corporate_partnership_enquiry_status(
  p_enquiry_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;
  if p_status is null or p_status not in ('new', 'in_progress', 'contacted', 'closed', 'spam') then
    raise exception 'invalid_enquiry_status';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'admin_notes_too_long';
  end if;

  update public.corporate_partnership_enquiries
  set status = p_status,
      admin_notes = v_notes,
      reviewed_by = case when p_status = 'new' then null else auth.uid() end,
      reviewed_at = case when p_status = 'new' then null else now() end,
      updated_at = now()
  where id = p_enquiry_id;

  if not found then
    raise exception 'enquiry_not_found';
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'platform_staff',
    'update_corporate_partnership_enquiry_status',
    'corporate_partnership_enquiry',
    p_enquiry_id,
    jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on function public.set_corporate_partnership_enquiry_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_corporate_partnership_enquiry_status(uuid, text, text)
  to authenticated;

comment on table public.corporate_partnership_enquiries is
  'MCK partnership enquiries; browser intake uses a validation/rate-limit RPC, and only platform admins may read rows.';
comment on function public.submit_corporate_partnership_enquiry(text, text, text, text, text, boolean, uuid, text) is
  'Validates and rate-limits public partnership enquiry intake; does not expose inserted PII to the caller.';
comment on function public.set_corporate_partnership_enquiry_status(uuid, text, text) is
  'Admin-only status and notes update for corporate partnership enquiries, with a PII-minimal audit record.';
