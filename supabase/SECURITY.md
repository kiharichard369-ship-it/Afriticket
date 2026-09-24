# Ticketyangu — Security Review (OWASP API Security Top 10)

This is a walkthrough of the actual schema, RLS policies, and functions
against each OWASP API Security Top 10 (2023) category — not a generic
checklist. Every "found and fixed" item below was caught by actually
running an attack against a real local Postgres, not by inspection alone.
Line references are to migration files in `/supabase/migrations`.

## API1:2023 — Broken Object Level Authorization

**Found and fixed (three separate times, across three phases):**

1. `check_in_ticket` (0010) originally took a caller-supplied
   `p_scanned_by` parameter and never checked the caller had check-in
   rights on the event at all — any authenticated user could mark any
   event's tickets used, and attribute the scan to someone else's user ID.
   Fixed (0010, revised) to drop the parameter, use `auth.uid()`
   internally for both the authorization check and the audit trail.
   Verified: a random authenticated user gets `not authorized`; legitimate
   check-in staff still works; `checkins.scanned_by` can't be spoofed.
2. An organiser could set their own event's `status` directly to
   `published`, skipping moderation — the "organisers update own" RLS
   policy (0007) checks *who* can update a row, not *what value* they set
   a column to. Fixed with a trigger (0009) that only allows specific
   status transitions for non-staff callers. Verified with a live UPDATE
   attempt that was rejected, and a legitimate staff publish that wasn't.
3. Staff had an UPDATE bypass for moderation but no matching SELECT
   policy, so they couldn't even see a `pending_review` event to moderate
   it — caught immediately by the fix above failing with "UPDATE 0".
   Added the missing staff SELECT policy (0009).

**Verified systematically:** queried `pg_policies` against every table to
confirm RLS is enabled everywhere (23/23 tables) and that the
zero-policy tables (`inventory_holds`, `inventory_ledger`,
`payment_webhook_events`) are the ones deliberately locked to
service-role-only access, not an oversight.

## API2:2023 — Broken Authentication

Delegated to Supabase Auth (password hashing, session tokens, refresh
rotation) rather than reimplemented. Frontend enforces `minLength={8}` on
signup — worth raising to a real password-strength check (e.g.
zxcvbn) before launch, not just a length floor. Rate limiting on
login/signup attempts is a Supabase Auth platform setting, not something
this schema controls — confirm it's configured before launch.

## API3:2023 — Broken Object Property Level Authorization

**Found and fixed:** `SupabaseEventsRepository` originally did
`select("*", ...)` against the raw `events` table for public/buyer-facing
reads. RLS filters *rows*, not *columns* — the public "published events"
policy correctly restricted which rows were visible, but every visible
row's `moderation_reason` (an internal staff note — e.g. "photo looks
unlicensed, verify before republishing") was included in the response.
Fixed (0012) with `events_public`, a view exposing only safe columns; the
frontend repository now queries that instead of the raw table. Verified
directly: `set role anon; select * from events_public` no longer returns
`moderation_reason` at all — it's not filtered client-side, it's absent
from the source.

Same pattern already existed correctly for ticket pricing:
`ticket_types_public` (0006) exposes `remaining` instead of raw
`capacity`, so a competitor can't see exactly how many seats an organiser
printed.

## API4:2023 — Unrestricted Resource Consumption

**Found and fixed:** nothing rate-limited `create_ticket_hold` at all — a
single session hammered it 15 times successfully with zero pushback,
which would let a bot lock up an event's entire inventory in short
holds, repeatedly, denying real buyers a chance to check out. Fixed
(0011) with `check_rate_limit()`, a small DB-level limiter (8 hold
attempts / 2 minutes per session key, 10 order-creation attempts / 5
minutes per phone/email), verified directly: the 9th rapid call in one
session correctly fails with `rate_limited`, while 20 *distinct* sessions
racing for 5 real seats still correctly resolves to exactly 5 successes
(the rate limiter doesn't interfere with legitimate concurrent buyers).

**Known limitation, documented not hidden:** this only slows a naive bot
reusing one session key. A bot rotating session keys per request isn't
stopped by this layer — that needs IP- or account-based limiting at the
edge/API-gateway level (Supabase's own rate limiting, or a CDN in front),
which is infrastructure configuration, not something this schema can
enforce. Set it up before launch if scalping/bot traffic is a realistic
concern for a given event.

## API5:2023 — Broken Function Level Authorization

Every privileged function checks its caller explicitly rather than
relying on who's allowed to call it at the grant level:
`approve_organiser_application` / `reject_organiser_application` check
`is_platform_staff()`; `approve_refund` checks platform staff OR the
event's own organisation finance/owner/manager role;
`reverse_check_in` checks event-scoped check-in-staff role. All verified
directly: a non-staff applicant calling `approve_organiser_application`
on their own application is rejected with `not authorized`.

`record_payment_initiation`, `confirm_payment_and_issue_tickets`, and
`fail_payment` are revoked from `anon`/`authenticated` entirely (0010) —
they trust their inputs as already-verified (a real provider webhook, or
a server-side payment call), so only the service role (used exclusively
by Edge Functions, never the browser) can call them.

## API6:2023 — Unrestricted Access to Sensitive Business Flows

**Found and fixed:** `create_ticket_hold`'s `per_order_limit` check only
looked at the current call's quantity, not what the same session already
held — a session could call it 15 times with quantity=1 each and
accumulate 15 held seats against a `per_order_limit` of 10. This wasn't a
crash or an error, it silently did exactly what was asked 15 times over,
which is the more dangerous kind of bug. Fixed (0011) to sum the caller's
own active holds on that ticket type first. Verified: 3 calls of
quantity=3 succeed (9 total, under the limit of 10), the 4th (which would
make 12) is correctly rejected, and the ledger confirms exactly 9 held,
not 12.

## API7:2023 — Server-Side Request Forgery

Not applicable in any form we could find: nothing in this codebase fetches
a URL supplied by a user from server-side code. Cover image URLs are
stored as plain text and rendered client-side (`<img src>`), never
fetched by a function or database trigger. If image upload/processing is
added later (resizing, thumbnailing), revisit this — that's exactly the
kind of feature that introduces an SSRF vector if it fetches a
user-supplied URL server-side.

## API8:2023 — Security Misconfiguration

**Found and fixed:** both Edge Functions' CORS headers defaulted to
`Access-Control-Allow-Origin: "*"`, meaning any website could call
`initiate-payment` from a visitor's browser. Fixed (`_shared/cors.ts`) to
read an `ALLOWED_ORIGIN` secret, falling back to `*` only when unset (so
local development isn't blocked by a missing secret) — **this means it's
still wide open until you actually set `ALLOWED_ORIGIN` in production; see
`/supabase/functions/README.md`.**

RLS is confirmed enabled on every table (see API1). Default Postgres
`PUBLIC` schema privileges aren't relied on for security — every
sensitive table's real protection is its RLS policy, matching how
Supabase's own platform grants work (broad table-level GRANTs to
`anon`/`authenticated`, with RLS as the actual gate).

CORS aside, `mpesa-webhook` doesn't need `ALLOWED_ORIGIN` protection at
all — it's called server-to-server by Safaricom, which doesn't send an
Origin header or honor CORS. Its actual protection is the shared-secret
URL path segment (see API9 and `MpesaPaymentAdapter.verifyCallback`).

## API9:2023 — Improper Inventory Management

PostgREST auto-exposes every `public` schema table/view via
`/rest/v1/<name>`, gated by RLS — this is normal Supabase behavior, not a
gap, but it means **anything you don't want publicly queryable needs an
RLS policy, not just "the frontend doesn't ask for it."** This is exactly
what API3 above was: the frontend never displayed `moderation_reason`,
but it was still fetchable by anyone who opened dev tools and queried the
table directly. Treat "no policy = can't be read" as the actual boundary,
not "no UI for it."

Two API surfaces exist and are both documented: PostgREST (auto-generated
from the schema) and the two Edge Functions
(`/supabase/functions/README.md`). No hand-rolled Express/Fastify routes
to lose track of.

## API10:2023 — Unsafe Consumption of APIs

The only external API this codebase calls is M-Pesa Daraja.
`MpesaPaymentAdapter` checks `res.ok` and `data.ResponseCode` before
trusting an STK push response, and `verifyCallback` authenticates via the
shared-secret path segment before parsing anything from an inbound
callback (Daraja doesn't sign callbacks, so this is the actual trust
boundary — a request without the correct secret is rejected before its
body is even parsed as JSON in `handleMpesaWebhook`, verified directly:
wrong secret → 401, and the fake payment/DB layer confirms nothing was
touched).

## Not covered by this review

- **CSRF**: not applicable in the traditional sense — Supabase Auth's
  default session storage is `localStorage`, not a cookie, and every
  request carries an explicit `Authorization: Bearer` header rather than
  relying on a browser auto-attaching credentials. CSRF exploits
  cookie-based ambient authority; there isn't any here. If you switch
  Supabase Auth to cookie-based sessions (SSR setups sometimes do), this
  reasoning no longer holds and needs revisiting.
- **Dependency vulnerabilities**: `npm audit` was run against the actual
  `package-lock.json` shipped in this project — **0 vulnerabilities**
  found. This is a point-in-time result, not a standing guarantee — new
  CVEs get published against existing package versions constantly, so
  re-run `npm audit` on a schedule (CI, or before each deploy), not just
  once. The Edge Functions' npm-specifier imports
  (`npm:@supabase/supabase-js@2`) should be version-pinned and reviewed
  the same way — Deno doesn't have an equivalent `npm audit` built in, so
  that one is a manual check against the npm advisory database.
- **Infrastructure-level protections** (DDoS mitigation, WAF, IP
  allowlisting for the Supabase dashboard itself) are Supabase
  platform/hosting concerns, outside what a schema or Edge Function can
  enforce.
