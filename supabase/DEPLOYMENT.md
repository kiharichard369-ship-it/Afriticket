# Ticketyangu — Release and Handover

## Staging vs. production

Use **two separate Supabase projects**, not one project with two
"environments" — Supabase doesn't have a built-in staging/prod split
within one project, and sharing a project means a bad migration or a
sandbox M-Pesa test payment touches real data. For each project
separately:

1. Run all 14 migrations in order (`/supabase/README.md`).
2. Run `seed.sql` only in staging — never in production (it's harmless
   there too, but there's no reason to).
3. Deploy both Edge Functions with that project's own secrets
   (`/supabase/functions/README.md`) — staging should point
   `PAYMENT_PROVIDER` at `mock` or M-Pesa **sandbox**; production points
   at M-Pesa's real host with real shortcode/passkey.
4. Separate `.env` files (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`)
   per environment, built into separate frontend deployments.

## Migration procedure

Migrations are plain numbered SQL files, run in order, forward-only —
there are no "down" migrations in this project. For a new environment,
running all 14 in sequence is the whole procedure (verified repeatedly
throughout Phases 2–4: every clean rebuild from an empty database with
all 14 files applied without error).

**Rollback procedure**, since there's no automated down-migration: take a
`pg_dump` backup *before* applying a new migration to any environment
that has real data (not needed for a fresh database — only when you're
adding a migration to an already-running system). If the new migration
causes a problem:

1. Stop application traffic that would write through the new migration's
   changed functions/policies (put up a maintenance page, or point
   `VITE_SUPABASE_URL` at nothing briefly — there's no in-app maintenance
   mode built yet).
2. `pg_restore` the pre-migration backup into a fresh database (see
   `OPERATIONS.md` — this exact procedure was tested end to end).
3. Point the frontend/Edge Function secrets at the restored database, or
   restore over the original if you're confident (take one more backup of
   the broken state first regardless, in case the "fix" needs undoing).
4. Fix the migration file, test it against a throwaway database copy
   first, then reapply.

This is slower than a proper down-migration but correct, and matches
what's actually been tested rather than an untested reversal script.

## Environment variable / secret reference

**Frontend (`.env`, `VITE_`-prefixed — shipped into the browser bundle,
so nothing secret goes here):**

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes, once connecting Supabase | Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Yes, once connecting Supabase | The anon/public key — safe to expose; RLS is the real gate |

**Edge Functions (`supabase secrets set`, never committed):**

| Variable | Required | Notes |
|---|---|---|
| `PAYMENT_PROVIDER` | Yes | `mock` or `mpesa` |
| `ALLOWED_ORIGIN` | Should be set before launch | Your deployed frontend's exact origin — defaults to `*` (any site can call `initiate-payment`) if unset; see `SECURITY.md` API8 |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | Only if `PAYMENT_PROVIDER=mpesa` | From developer.safaricom.co.ke |
| `MPESA_SHORTCODE` | Only if mpesa | Sandbox default: `174379` |
| `MPESA_PASSKEY` | Only if mpesa | From the Daraja portal |
| `MPESA_BASE_URL` | Only if mpesa | Defaults to sandbox host; set to production host to go live |
| `MPESA_CALLBACK_URL` | Only if mpesa | Must include a long random secret path segment |
| `MPESA_WEBHOOK_SECRET` | Only if mpesa | The same secret from the URL above |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected | Don't set these yourself |

## Decisions that must be confirmed before a real launch

Carried over from the original build playbook — these change money
movement, privacy, access control, or legal exposure, so they're product
owner decisions, not engineering defaults:

- [ ] **Payment credentials**: production M-Pesa shortcode, passkey, and
      consumer key/secret — confirmed with Safaricom, not just sandbox.
- [ ] **Notification sender identity**: what email address/SMS sender ID
      tickets and confirmations come from (not built yet — see
      functions/README.md — but the identity needs deciding before it is).
- [ ] **Organiser verification policy**: what, if anything, beyond the
      application form (`organiser_applications`) is checked before
      approval — business registration, ID, a phone call?
- [ ] **Refund policy**: full refund, partial, deadline before an event,
      who approves (currently: platform staff or the event's own
      finance/owner/manager role) — `approve_refund` enforces
      *authorization*, not a specific *policy*, which is still a human
      decision per event or per organisation.
- [ ] **Settlement schedule**: when/how organisers actually receive money
      from ticket sales — not built at all; `orders`/`payments` track
      buyer-to-platform money movement only, nothing platform-to-organiser.
- [ ] **WhatsApp channel**: transactional (ticket delivery) or
      support-only? The `notification_channel` enum includes `whatsapp`
      but nothing sends through it yet.
- [ ] **Free/donation events**: `is_free` exists and Phase 1's fixtures
      use it, but there's no actual donation-collection flow — confirm
      whether "free" events need anything beyond a KES 0 ticket type.
- [ ] **Domain, legal text** (terms, privacy policy, refund policy as
      *displayed* text, not just as enforced code), **analytics
      consent**, and **monitoring ownership** (who gets paged from
      `OPERATIONS.md`'s runbooks) — none of these are code changes, all
      of them block a real launch.

## Support playbook

Support staff should be able to look up a buyer by **order reference**,
**phone**, **email**, or **ticket backup code** without exposing
unrelated customers' records. Today, this means a platform-staff account
querying directly:

```sql
-- By order reference
select * from public.orders where reference = 'TY-XXXXXXX';

-- By phone or email
select * from public.orders where buyer_phone = '2547...' or buyer_email = '...';

-- By ticket backup code
select t.*, o.reference from public.tickets t
join public.orders o on o.id = t.order_id
where t.backup_code = 'XXXXXXXX';
```

A dedicated support-search UI (rather than raw SQL) is a reasonable next
addition — `platform_staff` role already exists to gate it; it just isn't
built as a page yet.

## Known limitations (say this out loud to whoever launches this)

- One ticket type per order (checkout dialog enforces this; the backend
  could support a cart with more work).
- M-Pesa refunds are a manual payout — the B2C reversal API needs a
  separate credential not yet set up (`SECURITY.md`/functions/README.md).
- No scheduled sweep for `expire_stale_holds()` — wire it to pg_cron or a
  scheduled function before relying on holds reliably self-clearing under
  load.
- No email/SMS delivery — `notifications` rows queue but nothing sends.
- No camera-based check-in scanning — manual code entry only.
- Rate limiting on checkout is session-key-based, not IP-based — see
  `SECURITY.md` API4 for what that does and doesn't protect against.
- `ALLOWED_ORIGIN` defaults to `*` until explicitly set.

## Final smoke test (run this before calling anything a release candidate)

1. `npm run build` — must complete with zero errors (verified clean
   throughout this project's build).
2. `npm run lint` — zero errors (warnings are pre-existing and reviewed).
3. `deno test --allow-net --allow-read --allow-env supabase/functions` —
   20/20 passing.
4. Run all 14 migrations against a fresh database — verified clean.
5. With `PAYMENT_PROVIDER=mock`: browse events → pick tickets → complete
   checkout with a phone number NOT ending in "00" → confirm a ticket
   appears under "My tickets" with a scannable QR code.
6. As an organiser: apply → (as staff) approve → create a draft event →
   submit for review → (as staff) publish → confirm it appears on the
   public discovery page.
7. As check-in staff: scan the ticket code from step 5 → confirm `valid`,
   scan it again → confirm `already_used`.
8. Do not claim production readiness while `PAYMENT_PROVIDER=mock` in a
   production project, or while any item in the decisions checklist above
   is unchecked.
