-- Ticketyangu — 0011: close a real business-logic gap + add basic rate limiting
--
-- Bug found by testing: create_ticket_hold checked per_order_limit against
-- the quantity in THIS call only. Nothing stopped a session from calling it
-- 15 times with quantity=1 to accumulate 15 held seats against a
-- per_order_limit of 10 — the limit was decorative. Fixed to sum this
-- session's own active holds on the ticket type first.
--
-- Also found: nothing rate-limits how often create_ticket_hold can be
-- called at all, so a single identity could hammer it to repeatedly grab
-- and re-grab all remaining inventory the instant each hold expires,
-- denying real buyers a chance to check out (a griefing/scalping-bot
-- pattern, OWASP API4/API6). Session-key-based rate limiting only slows a
-- naive bot reusing one key — a bot rotating session keys per request
-- isn't stopped by this alone, so this is one layer, not the whole
-- defense; IP- or account-based limiting at the edge/API-gateway level is
-- the complementary layer and belongs to infrastructure, not this schema.

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_bucket_created_idx on public.rate_limit_events (bucket, created_at);

-- Cheap cleanup: called opportunistically, not on a schedule, since this
-- table is small and self-limiting (see check_rate_limit below).
create function public.prune_rate_limit_events(p_older_than interval default interval '1 hour')
returns void
language sql
security definer set search_path = public
as $$
  delete from public.rate_limit_events where created_at < now() - p_older_than;
$$;

-- Records an attempt and returns whether the caller is within the allowed
-- rate. Records the attempt even when it's over limit — so a caller can't
-- get free extra attempts by having earlier ones "not count".
create function public.check_rate_limit(p_bucket text, p_max_events int, p_window interval)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limit_events (bucket) values (p_bucket);

  select count(*) into v_count from public.rate_limit_events
  where bucket = p_bucket and created_at > now() - p_window;

  if random() < 0.01 then
    perform public.prune_rate_limit_events();
  end if;

  return v_count <= p_max_events;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, interval) from public, anon, authenticated;
revoke execute on function public.prune_rate_limit_events(interval) from public, anon, authenticated;

-- Replaces migration 0008's version: adds the cumulative per-order-limit
-- check and a rate limit, keeps everything else (including the mutex-lock
-- comment, still accurate) the same.
create or replace function public.create_ticket_hold(p_ticket_type_id uuid, p_quantity int, p_session_key text)
returns public.inventory_holds
language plpgsql
security definer set search_path = public
as $$
declare
  v_capacity int;
  v_limit int;
  v_remaining int;
  v_session_active_qty int;
  v_hold public.inventory_holds;
begin
  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  if not public.check_rate_limit('create_ticket_hold:' || p_session_key, 8, interval '2 minutes') then
    raise exception 'rate_limited: too many hold attempts, please slow down';
  end if;

  perform 1 from public.ticket_types where id = p_ticket_type_id for update;
  if not found then
    raise exception 'ticket type not found';
  end if;

  select capacity, per_order_limit into v_capacity, v_limit
  from public.ticket_types where id = p_ticket_type_id;

  -- Release any holds that expired while we were waiting for the lock.
  with expired as (
    update public.inventory_holds
    set status = 'expired'
    where ticket_type_id = p_ticket_type_id and status = 'active' and expires_at < now()
    returning id, quantity
  )
  insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, reason)
  select p_ticket_type_id, 'release', quantity, id, 'hold expired'
  from expired;

  -- Cumulative check: this session's own still-active holds on this ticket
  -- type, plus what it's asking for now, must not exceed per_order_limit.
  -- (Fixed here — see migration header. Previously only checked p_quantity
  -- against v_limit in isolation, so repeated small calls bypassed it.)
  select coalesce(sum(quantity), 0) into v_session_active_qty
  from public.inventory_holds
  where ticket_type_id = p_ticket_type_id and session_key = p_session_key and status = 'active';

  if v_session_active_qty + p_quantity > v_limit then
    raise exception 'quantity % would exceed per-order limit of % (already holding %)', p_quantity, v_limit, v_session_active_qty;
  end if;

  select v_capacity - coalesce(sum(
    case when entry_type in ('hold', 'confirm') then quantity
         when entry_type in ('release', 'refund') then -quantity
         else 0 end
  ), 0)
  into v_remaining
  from public.inventory_ledger where ticket_type_id = p_ticket_type_id;

  if v_remaining < p_quantity then
    raise exception 'sold_out: only % left', greatest(v_remaining, 0);
  end if;

  insert into public.inventory_holds (ticket_type_id, quantity, session_key)
  values (p_ticket_type_id, p_quantity, p_session_key)
  returning * into v_hold;

  insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, reason)
  values (p_ticket_type_id, 'hold', p_quantity, v_hold.id, 'checkout hold');

  return v_hold;
end;
$$;

grant execute on function public.create_ticket_hold(uuid, int, text) to anon, authenticated;

-- Same rate-limit treatment for checkout/order creation — an attacker
-- (or a buggy retry loop) shouldn't be able to hammer order creation
-- either, even though it's already idempotent per key.
create or replace function public.create_pending_order(
  p_hold_id uuid,
  p_buyer_email text,
  p_buyer_phone text,
  p_idempotency_key text
)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_hold public.inventory_holds;
  v_ticket_type public.ticket_types;
  v_existing public.orders;
  v_order public.orders;
  v_reference text;
begin
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return v_existing;
  end if;

  if not public.check_rate_limit('create_pending_order:' || coalesce(p_buyer_phone, p_buyer_email, 'anon'), 10, interval '5 minutes') then
    raise exception 'rate_limited: too many checkout attempts, please slow down';
  end if;

  select * into v_hold from public.inventory_holds where id = p_hold_id for update;
  if v_hold is null then
    raise exception 'hold not found';
  end if;
  if v_hold.status <> 'active' or v_hold.expires_at < now() then
    raise exception 'hold_expired';
  end if;

  select * into v_ticket_type from public.ticket_types where id = v_hold.ticket_type_id;

  v_reference := 'TY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));

  insert into public.orders (
    reference, buyer_id, buyer_email, buyer_phone, event_id, status,
    currency, subtotal_minor, fees_minor, total_minor, idempotency_key, hold_id
  ) values (
    v_reference, auth.uid(), p_buyer_email, p_buyer_phone, v_ticket_type.event_id, 'pending',
    v_ticket_type.currency, v_ticket_type.price_minor * v_hold.quantity, 0,
    v_ticket_type.price_minor * v_hold.quantity, p_idempotency_key, v_hold.id
  ) returning * into v_order;

  insert into public.order_items (order_id, ticket_type_id, unit_price_minor, quantity, line_total_minor)
  values (v_order.id, v_ticket_type.id, v_ticket_type.price_minor, v_hold.quantity,
          v_ticket_type.price_minor * v_hold.quantity);

  return v_order;
end;
$$;

grant execute on function public.create_pending_order(uuid, text, text, text) to anon, authenticated;
