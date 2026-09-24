-- Ticketyangu — 0003: ticket inventory
-- All money is stored in integer minor units (cents). Inventory is a ledger,
-- never a client-side counter, so concurrent checkouts cannot oversell.

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  description text,
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'KES',
  capacity int not null check (capacity >= 0),
  per_order_limit int not null default 10 check (per_order_limit > 0),
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ticket_types_event_idx on public.ticket_types (event_id);

create trigger ticket_types_set_updated_at
  before update on public.ticket_types
  for each row execute function public.set_updated_at();

create type inventory_entry_type as enum ('hold', 'release', 'confirm', 'refund', 'manual_adjustment');

-- Append-only ledger. Remaining capacity = capacity - sum(active holds + confirmed sales).
create table public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  ticket_type_id uuid not null references public.ticket_types (id) on delete cascade,
  entry_type inventory_entry_type not null,
  quantity int not null check (quantity <> 0),
  hold_id uuid,
  order_id uuid,
  reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index inventory_ledger_ticket_type_idx on public.inventory_ledger (ticket_type_id);
create index inventory_ledger_hold_idx on public.inventory_ledger (hold_id);

create type hold_status as enum ('active', 'expired', 'confirmed', 'released');

create table public.inventory_holds (
  id uuid primary key default gen_random_uuid(),
  ticket_type_id uuid not null references public.ticket_types (id),
  quantity int not null check (quantity > 0),
  status hold_status not null default 'active',
  session_key text not null, -- idempotency / anonymous-cart correlation before an order exists
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

create index inventory_holds_expiry_idx on public.inventory_holds (status, expires_at);

-- Remaining capacity, computed from capacity minus every non-released hold/sale.
create view public.ticket_type_availability as
select
  tt.id as ticket_type_id,
  tt.capacity,
  tt.capacity - coalesce(sum(
    case when l.entry_type in ('hold', 'confirm') then l.quantity
         when l.entry_type in ('release', 'refund') then -l.quantity
         else 0 end
  ), 0) as remaining
from public.ticket_types tt
left join public.inventory_ledger l on l.ticket_type_id = tt.id
group by tt.id, tt.capacity;

comment on view public.ticket_type_availability is
  'Server-computed remaining stock. Never trust a client-supplied remaining count.';
