// Afriticket M-Pesa STK Push setup guide
#import "report-theme.typ": report-accent, report-theme

#show: report-theme.with(
  title: "Afriticket M-Pesa STK Push Setup Guide",
  author: "Afriticket",
  rhythm: "report",
  running-header: true,
)

#let cmd(body) = block(fill: luma(245), stroke: 0.5pt + luma(205), radius: 4pt, inset: 9pt, width: 100%)[#text(font: "DejaVu Sans Mono", size: 8pt)[#body]]
#let sql(body) = block(fill: luma(245), stroke: 0.5pt + luma(205), radius: 4pt, inset: 9pt, width: 100%)[#text(font: "DejaVu Sans Mono", size: 8pt)[#body]]
#let env(body) = block(fill: luma(245), stroke: 0.5pt + luma(205), radius: 4pt, inset: 9pt, width: 100%)[#text(font: "DejaVu Sans Mono", size: 8pt)[#body]]
#let note(title, body) = block(fill: rgb("fff5e6"), stroke: 1pt + report-accent, radius: 5pt, inset: 10pt, width: 100%)[*#title*  #body]
#let check(text) = [☐ #text]

// ---------- Title page ----------
#page(margin: (top: 28%, x: 2.2cm), numbering: none, header: none)[
  #set par(first-line-indent: 0em)
  #align(center)[
    #text(size: 27pt, weight: "bold", fill: report-accent)[Afriticket]
    #v(0.4em)
    #text(size: 21pt, weight: "bold")[M-Pesa STK Push]
    #text(size: 21pt, weight: "bold")[Setup Guide]
    #v(0.7em)
    #text(size: 13pt, fill: luma(80))[Sandbox-to-production deployment checklist]
    #v(2em)
    #line(length: 42%, stroke: 0.6pt + report-accent)
    #v(2em)
    #text(size: 11pt)[Prepared for the Afriticket ticketing platform]
    #v(0.5em)
    #text(size: 10pt, fill: luma(90))[Updated: #datetime.today().display("[year]-[month]-[day]")]
  ]
]

// ---------- Contents ----------
#page(numbering: none, header: none)[
  #outline(title: [Contents], indent: 1.5em)
]

#counter(page).update(1)

= Purpose and scope

This guide explains how to connect Afriticket to Safaricom M-Pesa Daraja using the repository's real STK Push adapter. It covers the database, Supabase Edge Functions, Daraja credentials, the callback URL, sandbox testing, and the production switch.

The integration uses *STK Push* (also known as Lipa na M-Pesa Online). A buyer enters a Kenyan phone number in Afriticket, the `initiate-payment` Edge Function requests an STK prompt, and Safaricom later calls `mpesa-webhook`. The webhook confirms the payment and issues tickets only after the callback is validated.

#note("Important money-movement boundary", [Never put the Daraja consumer secret, passkey, service-role key, or webhook secret in the frontend `.env` file. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in the browser build.])

== Values used by this Afriticket build

- *Account reference:* `Afriticket`
- *Transaction description:* `Payment for Afriticket`
- *Transaction type:* `CustomerBuyGoodsOnline`
- *Business shortcode:* `3432873` as supplied for this deployment
- *PartyB:* blank, as required by the supplied buy-goods payload
- *Callback authentication:* a long random secret included as the final URL path segment

The shortcode must be the shortcode Safaricom has assigned to the Daraja environment you are using. If Safaricom gives you a different sandbox or production shortcode, use that value in the corresponding environment's Supabase secret.

= Architecture at a glance

#table(
  columns: (1.35fr, 2.7fr),
  inset: 7pt,
  stroke: 0.4pt + luma(205),
  fill: (_, row) => if calc.odd(row) { luma(248) } else { white },
  [*Component*], [*Responsibility*],
  [`CheckoutDialog`], [Creates server-priced holds and invokes `initiate-payment`.],
  [`initiate-payment`], [Reads the order total from Supabase and sends the STK Push through Daraja.],
  [`mpesa-webhook`], [Receives Safaricom's callback, validates the secret path, deduplicates it, and confirms or fails the payment.],
  [Database RPCs], [`record_payment_initiation`, `confirm_payment_and_issue_tickets`, and `fail_payment` maintain payment and ticket state.],
)

= Step 1 — Confirm prerequisites

Before configuring payments, confirm the following:

#check("You have access to the Afriticket GitHub repository and local project directory.") \
#check("You have a Supabase project for staging. Use a separate project for production.") \
#check("The Supabase CLI is installed and authenticated.") \
#check("The frontend will be served from HTTPS in staging/production.") \
#check("You have a Safaricom Daraja account and can create an API app.") \
#check("You have decided which project will use sandbox and which will use production money movement.")

From the project root, confirm the current branch and CLI:

#cmd(`git branch --show-current
supabase --version`)

#note("Use staging first", [Do not point a real production shortcode at an untested frontend or an unverified callback. Test with Daraja sandbox first, then repeat the configuration in a separate production Supabase project.])

= Step 2 — Apply the Afriticket database migrations

Run all migrations in filename order. The M-Pesa functions depend on the payment tables and RPCs created earlier in the chain.

The current repository contains migrations `0001` through `0020`. If using the Supabase CLI and the project is linked:

#cmd(`supabase link --project-ref <staging-project-ref>
supabase db push`)

If using the Supabase SQL Editor, paste and run each file separately in this order:

#text(font: "DejaVu Sans Mono", size: 8pt)[`20260101000001_extensions_and_identity.sql
20260101000002_catalog.sql
20260101000003_inventory.sql
20260101000004_orders_and_payments.sql
20260101000005_tickets_notifications_audit.sql
20260101000006_row_level_security.sql
20260101000007_organiser_applications.sql
20260101000008_inventory_functions.sql
20260101000009_event_status_transitions.sql
20260101000010_payments_tickets_checkin.sql
20260101000011_rate_limiting_and_order_limit_fix.sql
20260101000012_events_public_view_and_org_lock.sql
20260101000013_operational_metrics.sql
20260101000014_data_export_and_deletion.sql
20260101000015_landing_page_settings.sql
20260101000016_wallpaper_storage_bucket.sql
20260101000017_multi_ticket_checkout.sql
20260101000018_notification_delivery_worker.sql
20260101000019_event_cover_images.sql
20260101000020_category_management.sql`]

Verify that the payment schema exists:

#sql(`select to_regclass('public.orders') as orders,
       to_regclass('public.payments') as payments,
       to_regclass('public.payment_webhook_events') as webhook_events;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'record_payment_initiation',
    'confirm_payment_and_issue_tickets',
    'fail_payment'
  );`)

All three tables and all three routines must be present before continuing. If `public.events` or `public.orders` is missing, stop and apply the earlier migrations first; migrations `0015`–`0020` are extensions, not a replacement for the base schema.

= Step 3 — Create a Daraja application

1. Open the official #link("https://developer.safaricom.co.ke/")[Daraja Developer Portal].
2. Create an account or sign in.
3. Create a new application for the Afriticket staging environment.
4. Enable the M-PESA Express / STK Push API for the app.
5. Copy the *Consumer Key* and *Consumer Secret* into a secure password manager.
6. Record the sandbox shortcode and passkey shown by Daraja. For this Afriticket deployment, the requested shortcode is `3432873`; do not assume the generic Daraja demo shortcode is interchangeable with it.
7. Keep the sandbox base URL as `https://sandbox.safaricom.co.ke`.

The Afriticket adapter calls these Daraja endpoints:

#text(font: "DejaVu Sans Mono", size: 8pt)[`GET  /oauth/v1/generate?grant_type=client_credentials
POST /mpesa/stkpush/v1/processrequest
POST /mpesa/stkpushquery/v1/query`]

= Step 4 — Generate the callback secret

The callback URL includes a secret path segment because Daraja callbacks are not signed by the adapter. Generate a high-entropy secret locally:

#cmd(`openssl rand -hex 32`)

Copy the output into a password manager. Do not commit it to GitHub, paste it into the frontend `.env`, or put it in a screenshot. In the examples below, replace `<callback-secret>` with that value.

The resulting callback URL will be:

#text(font: "DejaVu Sans Mono", size: 8pt)[`https://<project-ref>.supabase.co/functions/v1/mpesa-webhook/<callback-secret>`]

The final path segment must be exactly the same in both `MPESA_CALLBACK_URL` and `MPESA_WEBHOOK_SECRET`.

= Step 5 — Deploy the Edge Functions

From the Afriticket project root, deploy the STK initiation function and the public webhook function:

#cmd(`supabase link --project-ref <staging-project-ref>
supabase functions deploy initiate-payment
supabase functions deploy mpesa-webhook --no-verify-jwt`)

The `--no-verify-jwt` flag is required for `mpesa-webhook` because Safaricom sends the callback without a Supabase Authorization header. The function still authenticates callbacks using the secret path segment before processing the body.

The function URLs are:

#text(font: "DejaVu Sans Mono", size: 8pt)[`https://<project-ref>.supabase.co/functions/v1/initiate-payment
https://<project-ref>.supabase.co/functions/v1/mpesa-webhook/<callback-secret>`]

= Step 6 — Set Supabase secrets

Set the secrets in the same Supabase project where the functions were deployed. The following is the complete staging configuration for the Afriticket adapter:

#cmd(`supabase secrets set \
  PAYMENT_PROVIDER=mpesa \
  ALLOWED_ORIGIN=https://<staging-frontend-domain> \
  MPESA_CONSUMER_KEY='<daraja-consumer-key>' \
  MPESA_CONSUMER_SECRET='<daraja-consumer-secret>' \
  MPESA_SHORTCODE=3432873 \
  MPESA_PASSKEY='<daraja-passkey>' \
  MPESA_BASE_URL=https://sandbox.safaricom.co.ke \
  MPESA_CALLBACK_URL='https://<project-ref>.supabase.co/functions/v1/mpesa-webhook/<callback-secret>' \
  MPESA_WEBHOOK_SECRET='<callback-secret>'`)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected by Supabase Edge Functions. Do not set or expose them in the frontend.

To inspect secret names without printing values:

#cmd(`supabase secrets list`)

After changing secrets, redeploy both payment functions so the deployment is unquestionably using the new values:

#cmd(`supabase functions deploy initiate-payment
supabase functions deploy mpesa-webhook --no-verify-jwt`)

= Step 7 — Configure the frontend

In the frontend project's `.env`, set only the public Supabase variables:

#env(`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-public-key>`)

Restart the frontend after changing `.env` and rebuild it:

#cmd(`npm install
npm run lint
npm run build`)

Deploy the resulting frontend to the staging domain used in `ALLOWED_ORIGIN`. The browser invokes `initiate-payment` through Supabase; it does not call Safaricom directly.

= Step 8 — Register the callback in Daraja

In the Daraja application settings, register the *exact* value of `MPESA_CALLBACK_URL` as the STK Push `CallBackURL`.

Check all of the following:

#check("The URL uses HTTPS.") \
#check("The project reference is the same Supabase project used for the deployed functions.") \
#check("The path ends with `/functions/v1/mpesa-webhook/<callback-secret>`.") \
#check("There is no trailing space, accidental quote, or missing secret segment.") \
#check("The callback URL is reachable from the public internet, not only from localhost.")

The STK request generated by this Afriticket code contains:

#text(font: "DejaVu Sans Mono", size: 8pt)[`{
  "BusinessShortCode": "3432873",
  "TransactionType": "CustomerBuyGoodsOnline",
  "PartyA": "<customer-phone>",
  "PartyB": "",
  "CallBackURL": "<MPESA_CALLBACK_URL>",
  "AccountReference": "Afriticket",
  "TransactionDesc": "Payment for Afriticket"
}`]

The password is generated at request time as Base64(`shortcode + passkey + timestamp`). Do not precompute or store it.

= Step 9 — Run the sandbox smoke test

1. Sign in to Afriticket with a buyer account.
2. Confirm that the frontend is using the intended Supabase project.
3. Open a published event with an available ticket type.
4. Select a ticket and continue to M-Pesa payment.
5. Enter the Daraja sandbox test MSISDN in the format expected by the Daraja sandbox, normally `2547XXXXXXXX`.
6. Submit the checkout.
7. Confirm that the order becomes `awaiting_payment` and an STK prompt is simulated by the sandbox.
8. Complete the sandbox prompt using Daraja's documented test instructions.
9. Confirm that the callback reaches `mpesa-webhook`.
10. Confirm that the order becomes `paid` and the ticket appears under *My tickets*.

Check the database after the test:

#sql(`select o.reference, o.status as order_status,
       p.provider, p.provider_reference, p.status as payment_status,
       p.confirmed_at
from public.orders o
join public.payments p on p.order_id = o.id
order by p.created_at desc
limit 10;`)

A successful flow should show `order_status = 'paid'`, `payment_status = 'succeeded'`, a Daraja `provider_reference`, and a non-null `confirmed_at`.

= Step 10 — Inspect logs and troubleshoot

Tail the two payment functions while testing:

#cmd(`supabase functions logs initiate-payment
supabase functions logs mpesa-webhook`)

Common failures:

#table(
  columns: (1.25fr, 2.55fr),
  inset: 7pt,
  stroke: 0.4pt + luma(205),
  fill: (_, row) => if calc.odd(row) { luma(248) } else { white },
  [*Symptom*], [*Likely cause and action*],
  [`M-Pesa auth failed`], [Consumer key/secret mismatch, wrong base URL, or sandbox app not enabled. Re-copy both credentials and keep the sandbox host.],
  [`STK push rejected`], [Shortcode/passkey mismatch, invalid phone format, unsupported transaction type for the shortcode, or an amount rejected by the environment.],
  [`Callback never arrives`], [Wrong callback URL, function deployed with JWT verification still enabled, non-HTTPS URL, or callback secret mismatch.],
  [`Webhook returns 401`], [The final URL path segment does not equal `MPESA_WEBHOOK_SECRET`.],
  [`Payment callback is accepted but order is unchanged`], [The callback's CheckoutRequestID does not match the recorded provider reference, or the database migration/RPCs are incomplete.],
  [`Frontend says function is not deployed`], [`initiate-payment` is missing from the same Supabase project used by `VITE_SUPABASE_URL`, or the frontend was built before the environment values were added.],
)

To check whether the public webhook route is reachable, send a harmless authenticated-shaped callback with a nonexistent checkout ID. This should not confirm a real order:

#cmd(`curl -i -X POST \
  'https://<project-ref>.supabase.co/functions/v1/mpesa-webhook/<callback-secret>' \
  -H 'content-type: application/json' \
  --data '{"Body":{"stkCallback":{"MerchantRequestID":"smoke","CheckoutRequestID":"smoke-unknown","ResultCode":1032,"ResultDesc":"Smoke test"}}}'`)

Do not use a real CheckoutRequestID in this smoke test.

= Step 11 — Move from sandbox to production

Production is a separate configuration, not a code edit:

1. Create or obtain the production Daraja application and its approved shortcode/passkey.
2. Confirm the production shortcode supports `CustomerBuyGoodsOnline` for the intended merchant account.
3. Deploy a separate production Supabase project or confirm the project separation policy.
4. Deploy the same two Edge Functions to the production project.
5. Generate a new production callback secret. Never reuse the staging secret.
6. Set production secrets with `MPESA_BASE_URL=https://api.safaricom.co.ke` and the production shortcode, passkey, consumer key, consumer secret, callback URL, and webhook secret.
7. Register the production callback URL in the production Daraja application.
8. Set the production frontend's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the production project.
9. Set `ALLOWED_ORIGIN` to the exact production frontend origin.
10. Perform a controlled low-value production test only after Safaricom confirms the merchant account is enabled.
11. Monitor function logs and `metric_payment_reconciliation` after launch.

#note("Production safety", [Do not switch `PAYMENT_PROVIDER=mpesa` in a production project until the production shortcode, passkey, callback registration, refund policy, and settlement process have been confirmed. This integration records buyer-to-platform payment state; organiser settlement is a separate operational process.])

= Final launch checklist

#check("Migrations 0001–0020 are applied in order.") \
#check("`record_payment_initiation`, `confirm_payment_and_issue_tickets`, and `fail_payment` exist.") \
#check("Both Edge Functions are deployed to the intended project.") \
#check("`mpesa-webhook` is deployed with `--no-verify-jwt`.") \
#check("All `MPESA_*` secrets are set only in Supabase Edge Function secrets.") \
#check("The shortcode is correct for the selected Daraja environment.") \
#check("The callback URL and webhook secret use the same random path segment.") \
#check("Daraja has the exact callback URL registered.") \
#check("The frontend has only public `VITE_SUPABASE_*` values.") \
#check("`ALLOWED_ORIGIN` matches the deployed frontend origin.") \
#check("A sandbox payment created a paid order and issued a ticket.") \
#check("A failed or cancelled payment released the inventory hold.") \
#check("Payment and webhook logs are visible to the operator responsible for launch.") \
#check("M-Pesa refunds and organiser settlement have an agreed manual/operational process.")

= Reference links

- #link("https://developer.safaricom.co.ke/")[Safaricom Daraja Developer Portal]
- #link("https://github.com/kiharichard369-ship-it/Afriticket")[Afriticket GitHub repository]
- Repository deployment notes: `supabase/functions/README.md` and `supabase/DEPLOYMENT.md`
- Repository payment adapter: `supabase/functions/_shared/mpesaProvider.ts`
