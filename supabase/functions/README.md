# Ticketyangu — Edge Functions

Two functions, both Deno. Neither is deployed by this codebase — that
happens once via the Supabase CLI, from your machine, against your project.

## What's here

- `_shared/paymentAdapter.ts` — the interface every provider implements:
  `initiate`, `query`, `verifyCallback`, `refund`.
- `_shared/mockPaymentProvider.ts` — deterministic mock: a phone number
  ending in "00" fails, everything else succeeds, resolved synchronously
  (no webhook). Use this for local dev and demos before you have real
  M-Pesa sandbox credentials.
- `_shared/mpesaProvider.ts` — real Safaricom Daraja STK Push client
  (OAuth, STK push, status query, callback parsing). Sandbox by default
  (`baseUrl` defaults to `https://sandbox.safaricom.co.ke`); point it at
  the production host once you're ready to go live.
- `_shared/dbClient.ts` — the DB operations both functions need, as an
  interface. The real implementation wraps `@supabase/supabase-js` with
  the **service role key** — these calls hit `record_payment_initiation`,
  `confirm_payment_and_issue_tickets`, and `fail_payment`, which migration
  0010 deliberately revokes from `anon`/`authenticated`. Only this
  service-role path can call them.
- `initiate-payment/` — buyer clicks "Pay": looks up the order, calls the
  configured provider's `initiate()`, records the payment, and — for a
  provider that resolves synchronously (the mock) — confirms or fails the
  order immediately instead of waiting for a webhook that will never come.
- `mpesa-webhook/` — the public URL Safaricom calls back. Verifies the
  shared-secret path segment, deduplicates by `(provider, providerEventId)`
  against `payment_webhook_events`, then confirms or fails the matching
  payment.

## Tested, and how

Every file above has a `.test.ts` next to it. Run them with:

```bash
deno test --allow-net --allow-read supabase/functions
```

This was run for real before shipping (20 tests, all passing), including:

- The **M-Pesa adapter's actual HTTP flow** — `initiate()`, `query()`, and
  `verifyCallback()` — against a fake local Daraja server started with
  `Deno.serve` in the test file itself. This isn't mocked-fetch guesswork;
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
real Supabase project, or a real Safaricom sandbox call. That needs your
credentials and is worth doing once before going live — see below.

## Deploying

```bash
supabase functions deploy initiate-payment
supabase functions deploy mpesa-webhook --no-verify-jwt
```

`--no-verify-jwt` is required on `mpesa-webhook`: Safaricom calls it with
no Authorization header at all, so Supabase's default JWT check would
reject every real callback before your code even runs.

## Secrets

```bash
supabase secrets set PAYMENT_PROVIDER=mock   # or: mpesa
supabase secrets set ALLOWED_ORIGIN=https://your-deployed-frontend.example.com

# Only needed once PAYMENT_PROVIDER=mpesa:
supabase secrets set MPESA_CONSUMER_KEY=...
supabase secrets set MPESA_CONSUMER_SECRET=...
supabase secrets set MPESA_SHORTCODE=174379          # sandbox default
supabase secrets set MPESA_PASSKEY=...
supabase secrets set MPESA_BASE_URL=https://sandbox.safaricom.co.ke
supabase secrets set MPESA_CALLBACK_URL=https://<project-ref>.supabase.co/functions/v1/mpesa-webhook/<pick-a-long-random-secret>
supabase secrets set MPESA_WEBHOOK_SECRET=<the-same-random-secret-from-the-URL-above>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the
platform — don't set those yourself.

Register `MPESA_CALLBACK_URL`'s value as your CallBackURL in the Daraja
developer portal for your sandbox (or production) app.

## Switching from mock to real M-Pesa

1. Get sandbox credentials from developer.safaricom.co.ke.
2. Set the `MPESA_*` secrets above and `PAYMENT_PROVIDER=mpesa`.
3. Redeploy both functions so they pick up the new secrets.
4. Test with Safaricom's sandbox test MSISDN (their docs specify one that
   always succeeds in sandbox) before touching production.
5. Money movement is exactly why this is a provider swap, not a code
   change: the frontend, the DB functions, and `mpesa-webhook` don't know
   or care which provider is configured.

## What Phase 3 deliberately left out

- **M-Pesa refunds** (`MpesaPaymentAdapter.refund()` throws on purpose) —
  Daraja's B2C reversal API needs a separately-issued, certificate-
  encrypted security credential, not just the consumer key/secret used for
  STK push. `approve_refund()` in the database still works today; it
  records the decision and marks tickets refunded, but the actual money
  movement is a manual payout until the B2C credential is set up.
- **Multi-ticket-type checkout** — `create_pending_order` takes one hold
  (one ticket type). The checkout dialog enforces "one type per order" for
  now rather than silently mis-handling a mixed cart.
- **A scheduled `expire_stale_holds()` call** — still true from Phase 2;
  wire it to pg_cron or a scheduled function when you're ready.
- **Real email/SMS delivery** — `confirm_payment_and_issue_tickets` queues
  a `notifications` row (`status: 'queued'`) but nothing sends it yet. A
  small Edge Function reading that queue and calling an email provider
  (Resend, etc.) is the natural next piece — the ticket data it needs
  (QR-ready `public_code`, event details) is already there.
