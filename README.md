# Ticketyangu

A Kenya-focused event discovery and ticket-booking platform. Built by Mirie
Technologies, following the four-phase build plan (Phase 1: public
discovery, on fixture data, wired for a clean swap to Supabase in later
phases).

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4 (warm paper/ink palette, saffron accent — see
  `src/index.css` for the design tokens)
- React Router
- Radix UI primitives (dialog) for accessible menus and modals
- Supabase (Postgres + Auth) — schema ready in `/supabase`, not yet wired
  into the frontend (see below)

## Getting started

```bash
npm install
npm run dev
```

```bash
npm run build   # type-checks then builds to dist/
npm run lint    # oxlint
npm run preview # serve the production build locally
```

## Project structure

```
src/
  types/event.ts            Domain types — mirror the Supabase schema
  data/fixtures.ts          Phase 1 demo event data (original copy, no
                             content copied from any reference site)
  repositories/
    eventsRepository.ts     The boundary every page/component talks to.
                             FixtureEventsRepository today; a
                             SupabaseEventsRepository implementing the same
                             interface is a Phase 2 drop-in — no component
                             changes required.
  hooks/
    useEventDiscovery.ts    Filter state synced to the URL (deep-linkable),
                             loading/error state, load-more pagination
    useTheme.ts             Light/dark mode, persisted
  components/
    layout/                 Utility bar, header, mobile menu, footer,
                             support entry point
    ui/                     Button, Card, Badge, Input, Select, Dialog,
                             Skeleton, EmptyState/ErrorState
    events/                 EventCard, EventGrid, FiltersBar, CalendarView,
                             LoadMore, category-to-visual mapping
  pages/
    DiscoveryPage.tsx        "/" — search, filters, results grid
    EventDetailPage.tsx      "/events/:slug" — full details + ticket
                             preview dialog (explicitly fixture-only)
    CalendarPage.tsx         "/calendar" — month grid + day filtering
    NotFoundPage.tsx
  pages/  (continued)
    LoginPage.tsx / SignUpPage.tsx    Email/password auth
    OrganiserApplyPage.tsx            Organiser application form
    OrganiserDashboardPage.tsx        Organiser's event list + status actions
    OrganiserEventFormPage.tsx        Create/edit event + inline ticket types
    OrganiserCheckinPage.tsx          Manual ticket check-in
    MyTicketsPage.tsx                 Buyer's tickets: QR codes, refund requests
    AccountSettingsPage.tsx           Data export (JSON download) and account deletion
    AdminModerationPage.tsx           Platform staff: approve applications,
                                       publish/send-back events, approve refunds
  components/events/CheckoutDialog.tsx  Real hold -> order -> payment flow
  context/AuthContext.tsx             Supabase auth session state
  hooks/
    useOrganisation.ts                Current user's organisation membership
    usePlatformStaff.ts                Current user's platform-staff status
  components/auth/RouteGuards.tsx     RequireAuth / RequireOrganiser /
                                       RequirePlatformStaff
supabase/
  migrations/                Full schema through payments, check-in,
                             refunds, rate limiting, the public-data-leak
                             fix, operational metrics, and data export/
                             deletion (14 files total)
  functions/                 Edge Functions: initiate-payment, mpesa-webhook,
                             and the mock/M-Pesa payment adapters, each with
                             its own Deno test file — see functions/README.md
  seed.sql                   Non-sensitive demo data
  README.md                  How to run the migrations, and how the
                              concurrency/authorization logic was tested
  SECURITY.md                 OWASP API Top 10 review with real findings
  OPERATIONS.md                Metrics views and incident runbooks
  DEPLOYMENT.md                 Release procedure, env reference, launch
                                 decisions checklist, smoke test
  ACCESSIBILITY.md               Contrast audit results and what still
                                   needs a human/browser pass
```

## What Phase 1 actually is

Per the build playbook, Phase 1 is public discovery only, on fixture data,
built so the data layer can be swapped for a real API without touching any
component:

- Responsive app shell: utility bar, primary nav, mobile menu, footer,
  floating support entry point, light/dark themes, visible focus states,
  `prefers-reduced-motion` respected.
- Event search, category/town/month/price filters, sort, pagination
  (load-more), deep-linkable via URL query params.
- Event detail page and a month calendar view with per-day counts.
- A ticket-selection dialog on the event page that computes an **estimated
  total client-side for preview only** — clearly labelled as such. No price,
  inventory, or payment logic here is authoritative; that's Phase 2/3.
- Every placeholder link (Help, Log in, Sell tickets, social links) is a
  real route/anchor that 404s honestly today rather than a fake dead click,
  and the support dialog explicitly says what's wired and what isn't yet.

Not in Phase 1 (by design, per the plan): accounts, real checkout,
payments, ticket issuance, organiser tools, moderation, or anything reading
from Supabase. The repository interface and the SQL schema exist now so
Phase 2 is additive, not a rewrite.

## Phase 2: identity, organiser tools, and safe inventory

Built and tested against a real local Postgres before shipping (see
`/supabase/README.md` for the exact test transcript):

- Email/password auth via Supabase Auth (`AuthContext`), with route guards
  for authenticated/organiser/platform-staff pages.
- `SupabaseEventsRepository` — same `EventsRepository` interface as the
  fixtures, swapped in automatically once `.env` has real credentials.
- Organiser application → platform-staff approval (atomically creates the
  organisation + owner membership) → organiser dashboard → event
  create/edit with inline ticket types → submit for review → staff
  publishes from `/admin/moderation`.
- Concurrency-safe ticket holds: 20 simultaneous buyers racing for 5 seats
  resolved to exactly 5 successes with no oversell; hold expiry correctly
  reclaims inventory; `create_pending_order` is idempotent on retry.
- An organiser cannot set their own event straight to `published` — that's
  enforced by a DB trigger, not just hidden in the UI, because RLS alone
  can't compare old vs. new column values on an UPDATE.

Not yet built (Phase 3, by design): payment initiation/webhooks, ticket
issuance, check-in, refunds. The event-detail ticket dialog still stops at
a labelled "preview" rather than calling the real hold/order functions,
since there's no payment step yet to hand off to.

## Phase 3: checkout, payments, tickets, and check-in

Real money-movement logic, tested before shipping (DB functions against a
real local Postgres, payment adapters and Edge Function handlers against a
real Deno runtime — see `/supabase/README.md` and
`/supabase/functions/README.md` for the full test transcripts):

- **Checkout dialog** (`CheckoutDialog.tsx`) now does the real thing once
  Supabase is configured: creates a ticket hold, creates a pending order,
  and calls the `initiate-payment` Edge Function — falling back to the old
  preview-only behaviour when Supabase isn't set up yet. Currently one
  ticket type per order; a mixed cart is a documented next step.
- **Payment adapters**: a deterministic mock provider (a phone number
  ending in "00" fails, everything else succeeds — for local dev and
  demos) and a real M-Pesa Daraja STK Push client, both behind the same
  interface. Tested the M-Pesa adapter's actual HTTP flow against a fake
  local Daraja server, not just mocked fetch calls.
- **Webhook handling**: `mpesa-webhook` verifies a shared-secret path
  segment (Daraja doesn't sign callbacks), deduplicates by
  `(provider, providerEventId)`, and is idempotent — a duplicate callback
  delivery is a no-op, tested directly.
- **Ticket issuance**: `confirm_payment_and_issue_tickets` is idempotent
  (a duplicate webhook doesn't double-issue), generates one row per
  admission unit with an opaque random `public_code` (what the QR encodes)
  and a human-readable backup code, and queues (but doesn't yet send) a
  confirmation notification.
- **"My tickets"** page: QR code per ticket, backup code, and a refund
  request button for paid tickets.
- **Organiser check-in**: manual code entry (camera scanning is a natural
  next step — noted in the page itself, not faked) calling `check_in_ticket`,
  which returns `valid` / `already_used` / `wrong_event` / etc. **This is
  authorization-checked at the database level**, not just hidden in the
  UI — a real gap where any logged-in user could check in any event's
  tickets was caught by testing and fixed; see `/supabase/README.md`.
- **Refunds**: buyer requests from "My tickets", platform staff approves
  from `/admin/moderation` (marks the order and tickets refunded and logs
  an inventory-ledger entry). The actual money movement for an M-Pesa
  refund isn't wired up yet — Daraja's B2C reversal API needs a separate
  credential — so approved refunds are a manual payout for now.

Not yet built, by design: real email/SMS ticket delivery (the
`notifications` row is queued but nothing sends it), a scheduled call to
`expire_stale_holds()`, and M-Pesa's actual refund API.

## Phase 4: hardening, operations, accessibility, and launch prep

Full detail lives in `/supabase/SECURITY.md`, `/supabase/OPERATIONS.md`,
`/supabase/DEPLOYMENT.md`, and `/supabase/ACCESSIBILITY.md` — this is the
short version.

**Security** — a real OWASP API Security Top 10 walkthrough, not a
generic checklist. Found and fixed four real issues by attacking the
actual schema: a session could bypass its own `per_order_limit` by
calling `create_ticket_hold` repeatedly with small quantities (fixed with
cumulative tracking); nothing rate-limited hold/order creation at all
(fixed, with the honest limitation documented — it stops one session
hammering, not a bot rotating identities); `moderation_reason` — an
internal staff note — was publicly readable on every event via `select *`
(fixed with a proper `events_public` view, discovered *before* shipping
that PostgREST's automatic embedding wouldn't have worked reliably
through a naive version of that view either, so it's flattened instead);
and both Edge Functions defaulted to `Access-Control-Allow-Origin: "*"`
(now configurable, but still `*` until you set `ALLOWED_ORIGIN`).
`npm audit`: 0 vulnerabilities, checked for real.

**Operations** — seven staff-only metrics views (checkout funnel, payment
reconciliation latency, refund rate, notification backlog, check-in
conflicts, webhook health), populated with real data and verified to
produce correct numbers, not just valid SQL. Structured JSON logging with
correlation IDs in both Edge Functions. Runbooks for payment-provider
outage, oversell investigation, event cancellation, and data restoration
— the restoration one tested for real: `pg_dump` → `pg_restore` into a
fresh database → confirmed matching data and working functions, zero
errors in the restore log.

**Accessibility** — computed actual WCAG contrast ratios for every color
pair in the design system (not eyeballed) and found two real AA failures:
saffron-toned link/CTA text and the "faint" tertiary text color were both
under 4.5:1 against the paper background. Fixed by darkening `ink-faint`
directly and splitting `saffron-dark` into a background-safe token and a
new `saffron-text` token for text use, since one value couldn't satisfy
both jobs. Also caught that the fix pushed badge text just under 4.5:1
against its own tinted background and adjusted the tint opacity to
compensate. Documented honestly what still needs a human with a screen
reader — this environment has none.

**Data rights** — `export_my_data()` and `request_account_deletion()`.
Deletion anonymizes (clears name/phone) rather than hard-deletes, since
financial records need to survive for accounting retention; an
organisation owner is blocked from self-deleting until they transfer or
close their organisation.

## Connecting Supabase (Phase 2 + 3)

1. Create a project at supabase.com.
2. Run the SQL in `/supabase/migrations` in order (see `/supabase/README.md`).
3. Optionally run `/supabase/seed.sql` for demo data.
4. Copy your Project URL and anon key into `.env` (see `.env.example`).
5. Create your account through the app, then have someone with platform
   staff access (insert a row into `platform_staff` directly the first
   time) approve your organiser application from `/admin/moderation`.
6. Deploy the Edge Functions and set their secrets — see
   `/supabase/functions/README.md`. Start with `PAYMENT_PROVIDER=mock` to
   test checkout end to end before setting up real M-Pesa sandbox
   credentials. Set `ALLOWED_ORIGIN` before any real launch — see
   `/supabase/SECURITY.md` (API8).
7. Before calling anything a real launch, work through
   `/supabase/DEPLOYMENT.md`'s decisions checklist (payment credentials,
   refund policy, settlement schedule, and more) and its final smoke test.

## Design system

Warm paper/ink palette with a saffron primary action color and a rust/sage
secondary palette, editorial serif display type (Fraunces) over a civic
sans (Public Sans). Tokens live as CSS custom properties in `src/index.css`
via Tailwind v4's `@theme`, so `bg-paper`, `text-ink`, `bg-saffron`, etc.
are available as utility classes everywhere.
