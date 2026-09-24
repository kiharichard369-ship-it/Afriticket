-- Ticketyangu — 0008: inventory hold functions
--
-- Concurrency strategy: every function below takes `select ... for update`
-- on the ticket_types row for the ticket type it's touching, before doing
-- anything else. That row never changes as part of this flow, so locking it
-- is a deliberate mutex: whichever concurrent caller gets the lock first
-- computes remaining stock and writes its ledger entry before the next
-- caller is allowed to read the (now updated) ledger. This is what makes
-- two simultaneous buyers for the last ticket resolve safely instead of
-- both succeeding.

create function public.create_ticket_hold(p_ticket_type_id uuid, p_quantity int, p_session_key text)
returns public.inventory_holds
language plpgsql
security definer set search_path = public
as $$
declare
  v_capacity int;
  v_limit int;
  v_remaining int;
  v_hold public.inventory_holds;
begin
  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  perform 1 from public.ticket_types where id = p_ticket_type_id for update;
  if not found then
    raise exception 'ticket type not found';
  end if;

  select capacity, per_order_limit into v_capacity, v_limit
  from public.ticket_types where id = p_ticket_type_id;

  if p_quantity > v_limit then
    raise exception 'quantity % exceeds per-order limit of %', p_quantity, v_limit;
  end if;

  -- Release any holds that expired while we were waiting for the lock, so
  -- they don't wrongly keep counting against availability.
  with expired as (
    update public.inventory_holds
    set status = 'expired'
    where ticket_type_id = p_ticket_type_id and status = 'active' and expires_at < now()
    returning id, quantity
  )
  insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, reason)
  select p_ticket_type_id, 'release', quantity, id, 'hold expired'
  from expired;

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

create function public.release_hold(p_hold_id uuid, p_reason text default 'buyer released')
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ticket_type_id uuid;
begin
  select ticket_type_id into v_ticket_type_id from public.inventory_holds where id = p_hold_id;
  if v_ticket_type_id is null then
    raise exception 'hold not found';
  end if;

  perform 1 from public.ticket_types where id = v_ticket_type_id for update;

  update public.inventory_holds
  set status = 'released'
  where id = p_hold_id and status = 'active';

  if found then
    insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, reason)
    select v_ticket_type_id, 'release', quantity, id, p_reason
    from public.inventory_holds where id = p_hold_id;
  end if;
end;
$$;

-- Sweeps every ticket type with stale active holds. Call this on a schedule
-- (e.g. pg_cron every minute, or a scheduled Edge Function) rather than
-- relying only on the just-in-time release inside create_ticket_hold.
create function public.expire_stale_holds()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  with locked_types as (
    select distinct ticket_type_id from public.inventory_holds
    where status = 'active' and expires_at < now()
    order by ticket_type_id
    for update of ticket_types
  ),
  lock_rows as (
    select 1 from public.ticket_types where id in (select ticket_type_id from locked_types) for update
  ),
  expired as (
    update public.inventory_holds
    set status = 'expired'
    where status = 'active' and expires_at < now()
    returning id, ticket_type_id, quantity
  ),
  ins as (
    insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, reason)
    select ticket_type_id, 'release', quantity, id, 'hold expired (sweep)'
    from expired
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

-- Creates a pending order against an active hold. Idempotent: calling it
-- again with the same idempotency key returns the original order instead
-- of creating a second one. This only gets the order to "pending" — moving
-- it to "paid" and issuing tickets is Phase 3's payment-webhook work.
create function public.create_pending_order(
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
  -- NOTE: checking v_existing.id (not "v_existing is not null") deliberately —
  -- a composite row's IS NOT NULL is only true when every column is
  -- non-null, and orders has nullable columns (buyer_id, buyer_phone), so
  -- the naive row-level check silently fails to detect a found row.
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return v_existing;
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

grant execute on function public.create_ticket_hold(uuid, int, text) to anon, authenticated;
grant execute on function public.release_hold(uuid, text) to anon, authenticated;
grant execute on function public.create_pending_order(uuid, text, text, text) to anon, authenticated;
-- expire_stale_holds is for the scheduler only, not the browser.
revoke execute on function public.expire_stale_holds() from public, anon, authenticated;
