# Ticketyangu — Supabase

This folder is source, not automation — nothing here runs itself. Run the
migrations in order the first time you set up a project, either by pasting
each one into the Supabase SQL Editor, or with the Supabase CLI.

## Migration order

1. `20260101000001_extensions_and_identity.sql` — profiles, organisations,
   organisation membership, platform staff, helper functions.
2. `20260101000002_catalog.sql` — categories, venues, events, sessions,
   media, policies.
3. `20260101000003_inventory.sql` — ticket types and the append-only
   inventory ledger + holds (this is what prevents overselling).
4. `20260101000004_orders_and_payments.sql` — orders, order items,
   payments, refunds, raw webhook event log.
5. `20260101000005_tickets_notifications_audit.sql` — issued tickets,
   check-ins, notifications, audit log.
6. `20260101000006_row_level_security.sql` — turns RLS on for every table
   and adds the base read/write policies.
7. `20260101000007_organiser_applications.sql` — the organiser application
   table, the `approve_organiser_application` / `reject_organiser_application`
   functions (atomically create the organisation + owner membership on
   approval), and the write policies the organiser dashboard needs.
8. `20260101000008_inventory_functions.sql` — `create_ticket_hold`,
   `release_hold`, `expire_stale_holds`, `create_pending_order`. This is the
   concurrency-safe core; see "Testing the hold functions yourself" below.
9. `20260101000009_event_status_transitions.sql` — a trigger that stops an
   organiser from setting their own event straight to `published`, and the
   staff SELECT policy needed to actually see `pending_review` events.
   **Run this after 0007**, since it depends on the staff-role helper.
10. `20260101000010_payments_tickets_checkin.sql` — payment confirmation +
    idempotent ticket issuance, check-in (with an authorization check —
    see below), and the refund request/approve flow. See
    `/supabase/functions/README.md` for the Edge Functions that call the
    payment-side functions here.
11. `20260101000011_rate_limiting_and_order_limit_fix.sql` — a real
    business-logic bug fix (cumulative per-order-limit enforcement — see
    `SECURITY.md` API6) plus basic rate limiting on hold/order creation
    (API4).
12. `20260101000012_events_public_view_and_org_lock.sql` — closes a data
    exposure gap (`moderation_reason` was publicly readable — see
    `SECURITY.md` API3) with a flattened public view, and blocks moving an
    event between organisations.
13. `20260101000013_operational_metrics.sql` — staff-only views for
    checkout funnel, payment reconciliation, refund rate, notification
    backlog, and check-in conflicts. See `OPERATIONS.md`.
14. `20260101000014_data_export_and_deletion.sql` — `export_my_data()` and
    `request_account_deletion()` (anonymize-and-keep-records, not a hard
    delete — financial records need to survive for accounting retention).

Run them strictly in order — later files depend on tables, views, and
functions created earlier.

## Further reading

- `SECURITY.md` — OWASP API Top 10 walkthrough, with every real
  vulnerability found (and fixed) during development, not a generic list.
- `OPERATIONS.md` — the metrics views above, plus incident runbooks
  (payment outage, oversell investigation, event cancellation, data
  restoration — the last one tested for real, not just documented).
- `DEPLOYMENT.md` — staging/production setup, migration rollback
  procedure, environment variable reference, the launch decisions that
  still need a human (payment credentials, refund policy, settlement
  schedule, and more), and a final smoke test checklist.
- `ACCESSIBILITY.md` — color contrast issues found by actually computing
  WCAG ratios (two real failures, fixed) and an honest list of what still
  needs a human with a screen reader, since this environment has none.

`seed.sql` (optional) — non-sensitive demo data: categories, one demo
organisation, two Nakuru venues, one published event with three ticket
types. Safe to run in any environment, including production.

## Using the Supabase CLI instead

If you'd rather use `supabase db push` / `supabase migration up`, copy the
nine files in `migrations/` into your project's own `supabase/migrations`
folder (same names, so they keep their order) and run:

```
supabase db push
```

Then run `seed.sql` separately — the CLI's own `seed.sql` convention only
auto-runs on `supabase db reset`, so run it manually against your project if
you're not using that flow.

## Testing the hold functions yourself

Before shipping migrations 0007–0009, I ran all nine against a real local
Postgres 16 (not just checked that they parse) and exercised the
concurrency-critical paths directly with `psql`:

- **20 simultaneous `create_ticket_hold` calls against 5 remaining seats**
  → exactly 5 succeeded, 15 got `sold_out`, `sum(quantity)` on active holds
  matched capacity exactly. No oversell.
- **Per-order limit** — requesting more than a ticket type's
  `per_order_limit` in one call is rejected before touching inventory.
- **Hold expiry** — manually expiring a hold and calling
  `create_ticket_hold` again on a now-full ticket type correctly reclaims
  the seat.
- **Idempotent `create_pending_order`** — calling it twice with the same
  idempotency key returns the original order both times; only one row is
  created. (This caught a real bug: composite-row `IS NOT NULL` in
  PL/pgSQL is only true when *every* column is non-null, so the naive
  `if v_existing is not null` check silently failed once `buyer_phone`
  was null. Fixed to check `v_existing.id is not null` instead — see the
  comment in migration 0008.)
- **Status-transition guard** — an organiser calling
  `UPDATE events SET status = 'published'` on their own draft is rejected
  by the trigger in migration 0009; only platform staff (checked via
  `is_platform_staff()`) can move a row out of `pending_review`. This also
  caught a real gap: the original organiser UPDATE policy from migration
  0007 had no column-level restriction, so without the trigger an organiser
  could publish their own event directly, skipping moderation entirely.
- **Organiser-application approval** — a non-staff applicant calling
  `approve_organiser_application` on their own application is rejected;
  a staff member's call atomically creates the organisation and owner
  membership row.
- **Full checkout → payment → tickets, end to end** — created a hold,
  created a pending order, initiated a mock payment, confirmed it, and
  got exactly the right number of `valid` tickets; called
  `confirm_payment_and_issue_tickets` a second time on the same payment
  (simulating a duplicate webhook) and got the same ticket count back,
  not double-issued.
- **Check-in** — a valid scan admits the ticket, a second scan of the same
  code correctly returns `already_used`, and a scan against the wrong
  event ID returns `wrong_event`. **This caught a real authorization
  gap**: `check_in_ticket` originally took a caller-supplied
  `p_scanned_by` parameter and never checked the caller actually had
  check-in rights on the event — meaning any authenticated user could
  mark any event's tickets as used, and could attribute the scan to
  someone else's user ID. Fixed to drop that parameter entirely and use
  `auth.uid()` for both the authorization check and the audit trail;
  verified a random authenticated user is now rejected with "not
  authorized" while legitimate check-in staff still works correctly.
- **Failed payment releases the hold** — `fail_payment` on a payment whose
  order has an active hold correctly frees those seats back to inventory.
- **Refund flow** — a buyer can request a refund only on their own paid
  order; approval (checked against platform-staff or the event's
  organisation finance/owner/manager role) marks the order refunded, marks
  every ticket on it refunded, and logs a `refund` ledger entry per ticket.
- **Cumulative per-order-limit enforcement (Phase 4 fix)** — 3 calls of
  quantity=3 against a `per_order_limit` of 10 succeed (9 total); a 4th
  that would make 12 is rejected, and the ledger confirms exactly 9 held.
  Before this fix, the limit was checked per-call only, so 15 calls of
  quantity=1 each all succeeded against the same limit of 10.
- **Rate limiting** — the 9th `create_ticket_hold` call within 2 minutes
  from the same session is rejected with `rate_limited`; 20 *distinct*
  sessions racing for 5 real seats still resolves to exactly 5 successes
  (the limiter doesn't interfere with legitimate concurrent buyers).
- **Public data exposure (Phase 4 fix)** — `select * from events_public`
  as the `anon` role no longer returns `moderation_reason`, verified by
  querying the view directly before and after the fix.
- **Organisation reassignment lock** — an organiser who legitimately owns
  two organisations still can't move an event between them; only platform
  staff can change `organisation_id`.
- **Operational metrics** — populated real checkout/payment data (one
  paid order, one failed), then confirmed `metric_checkout_funnel` showed
  exactly `checkout_success_rate_pct = 50.0`, and confirmed a non-staff
  authenticated user gets zero rows from every metrics view (not an
  error — the base tables' RLS + `security_invoker` on the views do that).
- **Backup and restore** — `pg_dump -F c` then `pg_restore` into a fresh
  database, with zero errors/warnings in the restore log, matching row
  counts, and a live `create_ticket_hold()` call against the restored
  database to confirm functions/triggers/RLS all survive intact — not
  just that the dump file was created.
- **Data export and deletion** — `export_my_data()` returns real order/
  ticket/membership history as JSON; `request_account_deletion()` blocks
  an organisation owner from deleting (must transfer/close the org
  first), and for a regular buyer it clears `full_name`/`phone` and the
  order's `buyer_email`/`buyer_phone` while leaving the order itself
  (amount, status, reference) intact for accounting retention.

For the payment-adapter and Edge Function tests (M-Pesa STK push against a
fake local Daraja server, webhook dedup, forged-secret rejection), see
`/supabase/functions/README.md` — those run under Deno, not psql.

To rerun any of this yourself locally: install Postgres, create a database,
add a minimal `auth.users` table and an `auth.uid()` stub reading a
`request.jwt.claim.sub` session variable (Supabase provides both for real;
this is just to approximate them locally), create `anon`/`authenticated`/
`service_role` roles, grant them table access the way Supabase's platform
does by default, then apply the nine migration files in order and drive
`select public.create_ticket_hold(...)` etc. directly.

## What's deliberately not here yet

- **Storage buckets** for event cover images and organiser documents —
  added when the media-upload flow is built, so the bucket policies match
  the actual upload path.
- **Payment adapter + webhook processing** (M-Pesa/card) and **ticket
  issuance** — `create_pending_order` gets a checkout to "pending"; moving
  it to "paid" and generating tickets needs a real payment provider
  contract, so it's not built yet.
- **A scheduled call to `expire_stale_holds()`** — the function exists and
  is tested, but nothing invokes it on a timer yet. Wire it to Supabase's
  pg_cron (`select cron.schedule('expire-holds', '* * * * *', 'select
  public.expire_stale_holds()')`) or a scheduled Edge Function once you're
  ready.
- The event-detail ticket dialog in the frontend still stops at "preview" —
  it doesn't call `create_ticket_hold`/`create_pending_order` yet, since
  there's no payment step for it to hand off to.

## Connecting the frontend

Create a Supabase project, run the nine migrations above (and optionally
`seed.sql`), then fill in `.env` at the project root (see `.env.example`)
with your project URL and anon key from Project Settings → API. The
frontend picks this up automatically: `src/repositories/eventsRepository.ts`
switches from fixtures to `SupabaseEventsRepository` the moment both
environment variables are present — no component changes needed.
