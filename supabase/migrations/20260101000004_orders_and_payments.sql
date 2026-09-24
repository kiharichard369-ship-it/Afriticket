-- Ticketyangu — 0004: orders and payments

create type order_status as enum (
  'pending', 'awaiting_payment', 'paid', 'cancelled', 'refund_requested', 'refunded', 'failed'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique, -- human-readable, e.g. TY-8F3K2Q
  buyer_id uuid references public.profiles (id),
  buyer_email text,
  buyer_phone text,
  event_id uuid not null references public.events (id),
  status order_status not null default 'pending',
  currency text not null default 'KES',
  subtotal_minor bigint not null default 0,
  fees_minor bigint not null default 0,
  total_minor bigint not null default 0,
  idempotency_key text not null unique,
  hold_id uuid references public.inventory_holds (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_buyer_idx on public.orders (buyer_id);
create index orders_event_idx on public.orders (event_id);
create index orders_status_idx on public.orders (status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id),
  -- Immutable snapshot at time of purchase, independent of later price changes.
  unit_price_minor bigint not null,
  quantity int not null check (quantity > 0),
  line_total_minor bigint not null
);

create index order_items_order_idx on public.order_items (order_id);

create type payment_status as enum ('initiated', 'pending', 'succeeded', 'failed', 'reversed');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null, -- e.g. 'mpesa', 'card', 'mock'
  provider_reference text,
  amount_minor bigint not null,
  status payment_status not null default 'initiated',
  initiated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  raw_event_id uuid -- points at payment_webhook_events for full audit trail
);

create index payments_order_idx on public.payments (order_id);
create unique index payments_provider_reference_idx on public.payments (provider, provider_reference)
  where provider_reference is not null;

-- Every inbound webhook, persisted raw, before any business logic runs.
-- Deduplicate by (provider, provider_event_id).
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payload jsonb not null,
  processed boolean not null default false,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create type refund_status as enum ('requested', 'approved', 'sent', 'failed', 'completed', 'rejected');

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  payment_id uuid references public.payments (id),
  amount_minor bigint not null,
  status refund_status not null default 'requested',
  reason text,
  requested_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();
