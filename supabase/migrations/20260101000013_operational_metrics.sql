-- Ticketyangu — 0013: operational metrics views
--
-- Plain views, not a metrics pipeline — point Grafana/Metabase/a scheduled
-- Edge Function at these, or just run them by hand during an incident.
-- Restricted to platform staff since they aggregate business data
-- (revenue, failure rates) across every organiser.

create view public.metric_checkout_funnel as
select
  date_trunc('day', created_at) as day,
  count(*) as orders_created,
  count(*) filter (where status = 'paid') as orders_paid,
  count(*) filter (where status = 'failed') as orders_failed,
  count(*) filter (where status = 'refunded') as orders_refunded,
  round(
    100.0 * count(*) filter (where status = 'paid') / nullif(count(*), 0), 1
  ) as checkout_success_rate_pct
from public.orders
group by 1
order by 1 desc;

create view public.metric_payment_reconciliation as
select
  date_trunc('hour', initiated_at) as hour,
  provider,
  count(*) as payments_initiated,
  count(*) filter (where status = 'succeeded') as payments_succeeded,
  count(*) filter (where status = 'failed') as payments_failed,
  count(*) filter (where status in ('initiated', 'pending')) as payments_still_open,
  -- How long it took from initiation to confirmation, for succeeded ones.
  round(avg(extract(epoch from (confirmed_at - initiated_at))) filter (where status = 'succeeded'), 1) as avg_reconciliation_seconds,
  round(max(extract(epoch from (confirmed_at - initiated_at))) filter (where status = 'succeeded'), 1) as max_reconciliation_seconds
from public.payments
group by 1, 2
order by 1 desc;

-- Payments stuck in "initiated"/"pending" for a while are the thing to
-- alert on — either a webhook never arrived, or the buyer abandoned the
-- M-Pesa prompt. Both are normal in small numbers; a growing count means
-- something's actually broken (e.g. the webhook URL is misconfigured).
create view public.metric_stuck_payments as
select p.id as payment_id, p.order_id, o.reference as order_reference, p.provider, p.provider_reference,
  p.status, p.initiated_at, extract(epoch from (now() - p.initiated_at)) / 60 as minutes_open
from public.payments p
join public.orders o on o.id = p.order_id
where p.status in ('initiated', 'pending')
  and p.initiated_at < now() - interval '15 minutes'
order by p.initiated_at;

create view public.metric_refund_rate as
select
  date_trunc('day', r.created_at) as day,
  count(*) as refunds_requested,
  count(*) filter (where r.status = 'approved') as refunds_approved,
  count(*) filter (where r.status = 'rejected') as refunds_rejected,
  sum(r.amount_minor) filter (where r.status = 'approved') as refunded_amount_minor
from public.refunds r
group by 1
order by 1 desc;

-- Notifications that have sat queued for a while mean the delivery worker
-- (not built yet — see supabase/functions/README.md) is either not
-- running or falling behind.
create view public.metric_notification_backlog as
select channel, template, count(*) as queued_count, min(created_at) as oldest_queued_at
from public.notifications
where status = 'queued'
group by 1, 2
order by oldest_queued_at;

-- Two "valid" results for the same ticket in a short window means two
-- scanners raced (shouldn't happen — check_in_ticket locks the row — but
-- worth alerting on if it ever shows up) or a reversal followed by a
-- re-scan, which is legitimate. Investigate rather than assume either way.
create view public.metric_checkin_conflicts as
select ticket_id, count(*) as scan_count,
  array_agg(result order by scanned_at) as results,
  array_agg(scanned_at order by scanned_at) as scanned_at_times
from public.checkins
group by ticket_id
having count(*) > 1
order by count(*) desc;

create view public.metric_webhook_health as
select provider, date_trunc('hour', received_at) as hour, count(*) as events_received,
  count(*) filter (where processed) as events_processed
from public.payment_webhook_events
group by 1, 2
order by 2 desc;

grant select on public.metric_checkout_funnel to authenticated;
grant select on public.metric_payment_reconciliation to authenticated;
grant select on public.metric_stuck_payments to authenticated;
grant select on public.metric_refund_rate to authenticated;
grant select on public.metric_notification_backlog to authenticated;
grant select on public.metric_checkin_conflicts to authenticated;
grant select on public.metric_webhook_health to authenticated;

-- Views don't inherit RLS from their base tables automatically in the way
-- people sometimes expect (they run with the privileges of the view owner
-- unless declared security_invoker), so gate access explicitly rather than
-- relying on the underlying orders/payments/refunds policies to do it.
alter view public.metric_checkout_funnel set (security_invoker = true);
alter view public.metric_payment_reconciliation set (security_invoker = true);
alter view public.metric_stuck_payments set (security_invoker = true);
alter view public.metric_refund_rate set (security_invoker = true);
alter view public.metric_notification_backlog set (security_invoker = true);
alter view public.metric_checkin_conflicts set (security_invoker = true);
alter view public.metric_webhook_health set (security_invoker = true);

-- With security_invoker on, these views now run as the querying role and
-- would be filtered down to "nothing" by the base tables' buyer/organiser
-- scoped RLS policies for anyone who isn't platform staff — which for a
-- staff-only dashboard is the wrong failure mode (silently empty rather
-- than "you can't do this"). Add explicit platform-staff bypass policies
-- on the base tables instead of leaving it to accidental row-filtering.
create policy "orders: platform staff read all" on public.orders for select
  using (public.is_platform_staff());
create policy "payments: platform staff read all" on public.payments for select
  using (public.is_platform_staff());
create policy "refunds: platform staff read all" on public.refunds for select
  using (public.is_platform_staff());
create policy "notifications: platform staff read all" on public.notifications for select
  using (public.is_platform_staff());
create policy "checkins: platform staff read all" on public.checkins for select
  using (public.is_platform_staff());
create policy "payment_webhook_events: platform staff read all" on public.payment_webhook_events for select
  using (public.is_platform_staff());
