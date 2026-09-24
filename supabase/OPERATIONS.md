# Ticketyangu — Operations

## Metrics (migration 0013)

Plain SQL views, staff-only (`is_platform_staff()`), queryable directly or
from Metabase/Grafana/anything that can run SQL against the Supabase
project. Verified against real data before shipping — not just that they
parse, that the numbers come out right (a 50%-success two-order test
produced exactly `checkout_success_rate_pct = 50.0`).

| View | What it shows | Alert on |
|---|---|---|
| `metric_checkout_funnel` | Orders created/paid/failed/refunded per day, success rate | A sudden drop in `checkout_success_rate_pct` |
| `metric_payment_reconciliation` | Payments initiated/succeeded/failed per hour per provider, average/max time-to-confirm | `avg_reconciliation_seconds` climbing, or `payments_still_open` growing |
| `metric_stuck_payments` | Individual payments open >15 minutes | Any row appearing at all, for more than a few minutes |
| `metric_refund_rate` | Refunds requested/approved/rejected per day, amount refunded | An unusual spike for one event |
| `metric_notification_backlog` | Queued (unsent) notifications by channel/template | Anything queued for more than a few minutes — the delivery worker isn't built yet (see functions/README.md), so right now this will always show a backlog; wire up delivery before treating this as a real alert |
| `metric_checkin_conflicts` | Tickets scanned more than once | Any row where results include two `valid`s in a row (shouldn't be possible — `check_in_ticket` locks the row — investigate as a possible bug, not just an operational event) |
| `metric_webhook_health` | Webhook events received vs. processed per hour | `events_received > events_processed` sustained over multiple hours |

Query example (find events awaiting review right now):

```sql
select * from public.metric_stuck_payments;
```

## Runbooks

### Payment provider (M-Pesa) outage

1. Check `metric_payment_reconciliation` — is `payments_still_open`
   climbing for the `mpesa` provider specifically?
2. Check Safaricom's status page / developer portal for a known outage.
3. If confirmed: nothing to "fail over" to automatically — there's no
   second live provider configured. Consider setting
   `PAYMENT_PROVIDER=mock` temporarily only if you have a manual
   settlement process ready (mock still requires a real payment channel
   outside the app); otherwise the honest move is a banner on checkout
   ("payments are temporarily delayed") rather than silently switching
   providers.
4. Once resolved, check `metric_stuck_payments` for orders left
   `awaiting_payment` during the outage — each one needs either a real
   webhook to arrive late (Daraja does retry) or a manual decision: query
   the payment status directly via `MpesaPaymentAdapter.query()` /
   Safaricom's own transaction status API, then call `confirm_payment_and_issue_tickets`
   or `fail_payment` by hand via the SQL editor with the service role.

### Notification (email/SMS) outage — once the delivery worker exists

Not built yet (see functions/README.md) — when it is, this runbook's
first step is: check `metric_notification_backlog`, then check the
delivery provider's own status/logs, then requeue by resetting affected
rows' `status` back to `'queued'` and re-running the worker. Documented
now so the shape of the runbook exists before the code does.

### Duplicate webhook delivery

This is not an incident — it's expected, tested behavior. Daraja retries
callbacks it doesn't get a fast 200 for. `mpesa-webhook` deduplicates by
`(provider, providerEventId)` via `payment_webhook_events`'s unique
constraint (verified directly: firing the same callback body twice only
calls `confirmPayment` once). If you see the same order confirmed twice
in application logs, that's two *different* correlation IDs
(`x-request-id`) both reaching `confirm_payment_and_issue_tickets` for the
same payment — check `metric_webhook_health` and
`payment_webhook_events` for that `provider_reference`; if there are two
distinct `provider_event_id`s, that's a genuine double-notification from
Safaricom (rare but possible) and `confirm_payment_and_issue_tickets`'s
own idempotency (checking for existing tickets before issuing) is what
actually protects you, not just the webhook dedup layer — two layers on
purpose.

### Oversell investigation

Should not be reachable — the whole point of `create_ticket_hold`'s
row-lock-based mutex (see the comment at the top of migration 0008) is
that it can't happen. If you ever see `sum(quantity)` of active holds +
confirmed sales exceed `capacity` for a ticket type:

```sql
select tt.name, tt.capacity,
  sum(case when l.entry_type in ('hold','confirm') then l.quantity
           when l.entry_type in ('release','refund') then -l.quantity
           else 0 end) as net_held
from public.ticket_types tt
join public.inventory_ledger l on l.ticket_type_id = tt.id
where tt.id = '<ticket_type_id>'
group by tt.id, tt.name, tt.capacity;
```

If `net_held > capacity`, stop and treat it as a data-integrity incident,
not routine cleanup: pull the full `inventory_ledger` history for that
ticket type in `created_at` order and reconstruct exactly which entry
broke the invariant before touching anything. This was stress-tested (20
concurrent buyers for 5 seats, exactly 5 succeeded) but a manual
`UPDATE`/direct SQL edit bypassing the functions is the most likely way
to actually cause this in practice — audit for that first.

### Event cancellation

1. Organiser or staff sets the event to `cancelled` (allowed transitions
   from `published`/`paused` — see the trigger in migration 0009).
2. This does **not** automatically refund every order — refunds are a
   deliberate per-order action (`request_refund`/`approve_refund`), not
   automatic, so the organiser/policy decision about *whether* a
   cancellation means a full refund is still a human one. Query affected
   orders:
   ```sql
   select id, reference, buyer_email, total_minor, status
   from public.orders where event_id = '<event_id>' and status = 'paid';
   ```
3. Notify buyers (manually, until the notification worker exists) and
   process refunds per your refund policy — see the "decisions to
   confirm" list in `DEPLOYMENT.md`.

### Data restoration

Tested for real before shipping, not just documented as a theoretical
step: `pg_dump -F c` the database, then `pg_restore` into a fresh
database — verified the restored database had matching row counts and
that `create_ticket_hold` still worked correctly against the restored
schema (functions, triggers, and RLS policies all survive a dump/restore
correctly, since they're schema objects like everything else).

```bash
# Backup (Supabase does this automatically on a schedule for paid plans —
# confirm your project's backup schedule and retention in the dashboard
# before assuming this is covered):
pg_dump "$DATABASE_URL" -F c -f backup.dump

# Restore into a NEW database — never restore over a live one without a
# second backup of the current state first:
createdb ticketyangu_restored
pg_restore -d ticketyangu_restored backup.dump
```

## Structured logging

Both Edge Functions emit single-line JSON logs (`_shared/logger.ts`) with
a `requestId` that ties every line in one invocation together, and
`initiate-payment` echoes it back as an `x-request-id` response header —
if a buyer reports a failed checkout, ask for that header value (visible
in their browser's network tab) and grep `supabase functions logs` for it
directly instead of hunting through timestamps.

## Secret rotation

- **M-Pesa consumer key/secret**: rotate via the Daraja developer portal,
  then `supabase secrets set` the new values and redeploy both functions.
  Old STK pushes already in flight will fail their `query()` calls during
  the rotation window — acceptable for a planned rotation, not for an
  emergency one (coordinate timing).
- **`MPESA_WEBHOOK_SECRET`**: changing this means updating your registered
  `CallBackURL` in the Daraja portal *and* the `MPESA_CALLBACK_URL` /
  `MPESA_WEBHOOK_SECRET` secrets *at the same time* — a mismatch here
  means every webhook gets silently rejected as unauthorized until fixed.
- **`SUPABASE_SERVICE_ROLE_KEY`**: rotate from the Supabase dashboard if
  it's ever suspected leaked. This key bypasses RLS entirely — treat a
  leak of it as a full-database-access incident, not a routine rotation.
