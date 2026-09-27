-- Afriticket — 0018: notification delivery worker scaffolding
--
-- The worker keeps status='queued' while a short lease is active so existing
-- clients and the backlog view remain backwards-compatible.
do $$
begin
  if to_regclass('public.notifications') is null then
    raise exception 'Migration 0018 requires public.notifications. Apply migrations 20260101000001 through 20260101000014 in filename order first.';
  end if;
end
$$; locked_until and
-- locked_by identify an in-flight attempt; an expired lease is claimable again.
-- Provider calls must use notification.id as their idempotency key.

alter table public.notifications
  add column if not exists attempt_count int not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists locked_by uuid,
  add column if not exists locked_until timestamptz,
  add column if not exists last_error text,
  add column if not exists next_attempt_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_attempt_count_nonnegative;
alter table public.notifications
  add constraint notifications_attempt_count_nonnegative check (attempt_count >= 0);

create index if not exists notifications_claim_idx
  on public.notifications (channel, created_at)
  where status = 'queued';

-- Claim and shape the minimum private payload needed by a provider adapter.
-- This runs only with the service role, never from the browser.
create or replace function public.claim_queued_notifications(
  p_channel public.notification_channel,
  p_limit int default 20,
  p_worker_id uuid default gen_random_uuid(),
  p_lease_seconds int default 300
)
returns table (
  id uuid,
  order_id uuid,
  channel public.notification_channel,
  template text,
  recipient text,
  order_reference text,
  event_title text,
  event_starts_at timestamptz,
  event_timezone text,
  venue_name text,
  venue_town text,
  ticket_codes jsonb
)
language plpgsql
security definer set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'notification claim limit must be between 1 and 100';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'notification lease must be between 30 and 3600 seconds';
  end if;

  return query
  with candidates as (
    select n.id
    from public.notifications n
    where n.channel = p_channel
      and n.status = 'queued'
      and (n.locked_until is null or n.locked_until < now())
      and (n.next_attempt_at is null or n.next_attempt_at <= now())
  order by n.created_at, n.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.notifications n
    set locked_by = p_worker_id,
        locked_until = now() + make_interval(secs => p_lease_seconds),
        attempt_count = n.attempt_count + 1,
        last_attempt_at = now(),
        last_error = null
    from candidates c
    where n.id = c.id
    returning n.*
  )
  select c.id,
    c.order_id,
    c.channel,
    c.template,
    case when c.channel = 'email'::public.notification_channel
      then o.buyer_email
      else coalesce(o.buyer_phone, p.phone)
    end as recipient,
    o.reference,
    e.title,
    e.starts_at,
    e.timezone,
    v.name,
    v.town,
    coalesce(
      jsonb_agg(
        jsonb_build_object('publicCode', t.public_code, 'backupCode', t.backup_code)
        order by t.public_code
      ) filter (where t.id is not null),
      '[]'::jsonb
    ) as ticket_codes
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.profiles p on p.id = c.recipient_profile_id
  left join public.events e on e.id = o.event_id
  left join public.venues v on v.id = e.venue_id
  left join public.tickets t on t.order_id = c.order_id
  group by c.id, c.order_id, c.channel, c.template, c.recipient_profile_id,
    o.buyer_email, o.buyer_phone, p.phone, o.reference, e.title, e.starts_at,
    e.timezone, v.name, v.town;
end;
$$;

-- State transitions are conditional on the lease owner. A late worker cannot
-- overwrite a newer attempt, and repeating a terminal transition is a no-op.
create or replace function public.mark_notification_sent(
  p_notification_id uuid,
  p_worker_id uuid,
  p_provider_reference text,
  p_delivery_status public.notification_status default 'sent'
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if p_delivery_status not in ('sent'::public.notification_status, 'delivered'::public.notification_status) then
    raise exception 'notification sent transition requires sent or delivered status';
  end if;

  -- Repeating the same terminal write is an idempotent success, even after
  -- the lease has been cleared by the first successful call.
  if exists (
    select 1 from public.notifications
    where id = p_notification_id
      and status = p_delivery_status
      and (p_provider_reference is null or provider_reference = p_provider_reference)
  ) then
    return true;
  end if;

  update public.notifications
  set status = p_delivery_status,
      provider_reference = coalesce(p_provider_reference, provider_reference),
      sent_at = coalesce(sent_at, now()),
      locked_by = null,
      locked_until = null,
      next_attempt_at = null,
      last_error = null
  where id = p_notification_id
    and status = 'queued'
    and locked_by = p_worker_id
    and locked_until >= now();

  return found;
end;
$$;

create or replace function public.mark_notification_failed(
  p_notification_id uuid,
  p_worker_id uuid,
  p_error text
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.notifications
    where id = p_notification_id and status = 'failed'
  ) then
    return true;
  end if;

  update public.notifications
  set status = 'failed',
      last_error = left(coalesce(p_error, 'provider delivery failed'), 2000),
      locked_by = null,
      locked_until = null
  where id = p_notification_id
    and status = 'queued'
    and locked_by = p_worker_id
    and locked_until >= now();

  return found;
end;
$$;

revoke all on function public.claim_queued_notifications(public.notification_channel, int, uuid, int) from public, anon, authenticated;
revoke all on function public.mark_notification_sent(uuid, uuid, text, public.notification_status) from public, anon, authenticated;
revoke all on function public.mark_notification_failed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_queued_notifications(public.notification_channel, int, uuid, int) to service_role;
grant execute on function public.mark_notification_sent(uuid, uuid, text, public.notification_status) to service_role;
grant execute on function public.mark_notification_failed(uuid, uuid, text) to service_role;
