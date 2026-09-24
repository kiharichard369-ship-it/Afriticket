-- Ticketyangu — 0005: tickets, check-in, notifications, audit log

create type ticket_status as enum ('valid', 'used', 'cancelled', 'refunded', 'expired');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  order_item_id uuid not null references public.order_items (id),
  ticket_type_id uuid not null references public.ticket_types (id),
  event_id uuid not null references public.events (id),
  -- Opaque, random, signed lookup token. Never a sequential ID and never
  -- personal data — this is what the QR code encodes.
  public_code text not null unique default encode(gen_random_bytes(16), 'hex'),
  backup_code text not null default upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 8)),
  holder_name text,
  status ticket_status not null default 'valid',
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz
);

create index tickets_order_idx on public.tickets (order_id);
create index tickets_event_idx on public.tickets (event_id);
create unique index tickets_public_code_idx on public.tickets (public_code);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id),
  scanned_by uuid references public.profiles (id),
  result text not null, -- valid | already_used | cancelled | refunded | wrong_event | expired
  is_reversal boolean not null default false,
  reversal_reason text,
  scanned_at timestamptz not null default now()
);

create index checkins_ticket_idx on public.checkins (ticket_id);

create type notification_channel as enum ('email', 'sms', 'whatsapp');
create type notification_status as enum ('queued', 'sent', 'delivered', 'failed');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id),
  recipient_profile_id uuid references public.profiles (id),
  channel notification_channel not null,
  template text not null,
  status notification_status not null default 'queued',
  provider_reference text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);
