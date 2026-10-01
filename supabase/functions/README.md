# Afriticket — Edge Functions

Three functions, all Deno. None is deployed by this codebase — that
happens once via the Supabase CLI, from your machine, against your project.

## What's here

- `_shared/paymentAdapter.ts` — the interface every provider implements:
  `initiate`, `query`, `verifyCallback`, `refund`.
- `_shared/mpesaProvider.ts` — real Safaricom Daraja STK Push client
  (OAuth, STK push, status query, callback parsing). The deployed entrypoints
  require an explicit production `MPESA_BASE_URL`.
- `_shared/dbClient.ts` — the DB operations both functions need, as an
  interface. The real implementation wraps `@supabase/supabase-js` with
  the **service role key** — these calls hit `record_payment_initiation`,
  `confirm_payment_and_issue_tickets`, and `fail_payment`, which migration
  0010 deliberately revokes from `anon`/`authenticated`. Only this
  service-role path can call them.
- `initiate-payment/` — buyer clicks "Pay": looks up the order, calls the
  production M-Pesa adapter, records the payment, and waits for the webhook
  before completing the order.
- `mpesa-webhook/` — the public URL Safaricom calls back. Verifies the
  shared-secret path segment, deduplicates by `(provider, providerEventId)`
  against `payment_webhook_events`, then confirms or fails the matching
  payment.
- `deliver-notifications/` — an authenticated, provider-neutral queue worker.
  It claims `queued` rows with a short lease, renders the private ticket
  payload, calls a configured email/SMS/WhatsApp adapter, and conditionally
  marks `sent`, `delivered`, or `failed` only while it still owns the lease.
  The queue key (`notifications.id`) is passed to providers as the request
  idempotency key. Configure the provider and scheduler below before treating
  email delivery as live.

## Tested, and how

The pure payment and notification handlers have `.test.ts` coverage. Run the
Edge Function tests with:

```bash
deno test --allow-net --allow-read supabase/functions
```

The existing payment suite was run locally before shipping (23 tests, all
passing), including:

- The **M-Pesa adapter's actual HTTP flow** — `initiate()`, `query()`, and
  `verifyCallback()` — against a fake local Daraja server started with
  `Deno.serve` in the test file itself. This isn't fetch guesswork;
  the adapter code makes real HTTP requests that a fake server receives,
  parses, and responds to exactly like Daraja would.
- Both Edge Function **handlers** (`handler.ts`, separate from the
  `Deno.serve` wrapper in `index.ts`) against a fake in-memory `DbClient`,
  covering: successful payment → ticket issuance, failed payment → hold
  released, **duplicate webhook delivery is a no-op the second time**,
  a forged webhook secret is rejected before touching the database, a
  callback for an unknown `providerReference` is acknowledged but not
  processed, and an already-paid order can't be paid for again.

What this does **not** cover: an actual deployed function talking to a
real Supabase project or a live Safaricom account. That needs your production
credentials — see below. The
notification handler tests use injected fake DB/provider adapters, so they do
not establish that a provider is configured or that external delivery is live.

## Deploying

```bash
supabase functions deploy initiate-payment
supabase functions deploy mpesa-webhook --no-verify-jwt
# Internal worker: keep Supabase JWT verification enabled.
supabase functions deploy deliver-notifications
```

`--no-verify-jwt` is required on `mpesa-webhook`: Safaricom calls it with
no Authorization header at all, so Supabase's default JWT check would
reject every real callback before your code even runs.

`deliver-notifications` is not a public browser endpoint. Its caller must
provide both Supabase's normal function authorization and the configured
`x-worker-secret` header. Invoke it from a scheduler or a private worker; do
not put that header or any provider key in the frontend.

## Secrets

```bash
supabase secrets set PAYMENT_PROVIDER=mpesa
# Local Vite development:
supabase secrets set ALLOWED_ORIGIN=http://localhost:5173
# Production: use the exact deployed origin, with no path or trailing slash.
# Example: https://afriticket.com

# Only needed once PAYMENT_PROVIDER=mpesa:
supabase secrets set MPESA_CONSUMER_KEY=...
supabase secrets set MPESA_CONSUMER_SECRET=...
supabase secrets set MPESA_SHORTCODE=3432873          # BusinessShortCode used for password generation
supabase secrets set MPESA_TILL_NUMBER=3495157        # Buy Goods till sent as PartyB
supabase secrets set MPESA_PASSKEY=...
supabase secrets set MPESA_BASE_URL=https://api.safaricom.co.ke
supabase secrets set MPESA_CALLBACK_URL=https://<project-ref>.supabase.co/functions/v1/mpesa-webhook/<pick-a-long-random-secret>
supabase secrets set MPESA_WEBHOOK_SECRET=<the-same-random-secret-from-the-URL-above>
```

Do not set `ALLOWED_ORIGIN` to a documentation placeholder such as
`https://<staging-frontend-domain>`. Browsers reject that value during the
preflight request. After changing the secret, redeploy `initiate-payment`
before retrying checkout.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the
platform — don't set those yourself.

The deployed payment entrypoints intentionally fail closed: `PAYMENT_PROVIDER`
must be explicitly `mpesa`, every `MPESA_*` secret above must be present, and
the base URL must be `https://api.safaricom.co.ke`.

### Notification worker configuration

#### Ticket emails for guest and signed-in buyers

After a successful M-Pesa callback, `confirm_payment_and_issue_tickets` creates
the ticket rows first and queues a `ticket_confirmation` email. The recipient
is `orders.buyer_email`, which is the email entered during checkout; it does
not depend on `orders.buyer_id` or on the buyer having an Afriticket account.
The email contains each ticket's entry code and backup code, so a buyer can
use the ticket without logging in. Signed-in buyers can also view the same
tickets under **My tickets**.

Email delivery is asynchronous. A queued notification will not leave Supabase
until `deliver-notifications` is deployed, Resend is configured, and a private
scheduler invokes the worker. The worker must be invoked every minute (or at a
similar cadence) with the Supabase function authorization and the
`x-worker-secret` header. Do not call it from the browser.

Migration `20260101000018_notification_delivery_worker.sql` adds lease and
attempt metadata and service-role-only RPCs:

- `claim_queued_notifications(channel, limit, worker_id, lease_seconds)` uses
  `FOR UPDATE SKIP LOCKED`, so concurrent workers do not claim the same row.
- `mark_notification_sent(...)` and `mark_notification_failed(...)` require
  the current lease owner. A late worker cannot overwrite a newer attempt.
- Provider calls should use the notification UUID as their idempotency key.
  If a provider call succeeds but the state write times out, the lease expires
  and the provider receives the same key on retry; use a provider that honors
  idempotency for exactly-once external effects.

The worker is configured by secrets (all disabled by default):

```bash
supabase secrets set NOTIFICATION_WORKER_SECRET="<long-random-value>"
supabase secrets set NOTIFICATION_EMAIL_PROVIDER=resend
supabase secrets set RESEND_API_KEY="..."
supabase secrets set NOTIFICATION_EMAIL_FROM="tickets@example.com"

# Optional SMS:
supabase secrets set NOTIFICATION_SMS_PROVIDER=twilio
supabase secrets set TWILIO_ACCOUNT_SID="..."
supabase secrets set TWILIO_AUTH_TOKEN="..."
supabase secrets set NOTIFICATION_SMS_FROM="+254..."

# Optional WhatsApp (Twilio sender format, for example whatsapp:+1415...):
supabase secrets set NOTIFICATION_WHATSAPP_PROVIDER=twilio
supabase secrets set NOTIFICATION_WHATSAPP_FROM="whatsapp:+1415..."

# Optional provider endpoint overrides and lease tuning:
supabase secrets set NOTIFICATION_EMAIL_API_URL="https://api.resend.com"
supabase secrets set NOTIFICATION_TWILIO_API_URL="https://api.twilio.com"
supabase secrets set NOTIFICATION_LEASE_SECONDS=300
```

Supported values are `resend` for email and `twilio` for SMS/WhatsApp. Do not
set a provider name unless all of its secrets and the sender identity have
been approved. No credentials are committed in this repository. Without
these secrets, the function deliberately returns an unavailable/configuration
error and queued notifications remain queued.

### Scheduling and hold expiry

The worker is a request-driven function, not a daemon. Schedule a private
POST at a modest cadence (for example every minute) with
`x-worker-secret: <NOTIFICATION_WORKER_SECRET>`. A scheduler may invoke one
request per enabled channel, or one request with all configured adapters. The
function processes at most 100 rows per channel per call; monitor
`metric_notification_backlog` and invoke again while the backlog remains.

Hold expiry is a separate database concern and must be scheduled too. After
the migrations are applied, run `select public.expire_stale_holds();` every
minute using Supabase pg_cron or the platform's scheduled SQL/Edge Function
facility. The frontend's just-in-time expiry is not a substitute under load.

Register `MPESA_CALLBACK_URL`'s value as your CallBackURL in the Daraja
production developer portal application.

## Production M-Pesa activation

1. Obtain production credentials and confirm that BusinessShortCode `3432873` and Buy Goods till `3495157` are enabled for the production Daraja application.
2. Set the `MPESA_*` secrets above and `PAYMENT_PROVIDER=mpesa`.
3. Redeploy both functions so they pick up the new secrets.
4. Test with an active production M-Pesa number and confirm the callback
   changes the payment and issues tickets.

## What Phase 3 deliberately left out and what 0017 adds

- **M-Pesa refunds** (`MpesaPaymentAdapter.refund()` throws on purpose) —
  Daraja's B2C reversal API needs a separately-issued, certificate-
  encrypted security credential, not just the consumer key/secret used for
  STK push. `approve_refund()` in the database still works today; it
  records the decision and marks tickets refunded, but the actual money
  movement is a manual payout until the B2C credential is set up.
- **Multi-ticket-type checkout** — migration 0017 adds atomic
  `create_ticket_holds` and `create_pending_order_multi` RPCs. They lock
  inventory, verify that every hold belongs to the same event/session, and
  calculate line prices and the order total from database rows. The legacy
  one-hold `create_pending_order` contract remains available for older clients.
- **A scheduled `expire_stale_holds()` call** — still true from Phase 2;
  wire it to pg_cron or a scheduled function when you're ready.
- **Real email/SMS delivery** — `confirm_payment_and_issue_tickets` queues
  a `notifications` row (`status: 'queued'`). The new
  `deliver-notifications` worker supplies the queue/adapter contract, but
  provider credentials, sender approval, migration 0018, and a schedule are
  still required before any external delivery is live.
