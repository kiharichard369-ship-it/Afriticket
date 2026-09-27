-- Afriticket — 0017: multi-ticket-type checkout
--
-- This migration is additive/forward-only. Existing one-ticket checkout RPCs and
-- orders remain valid; the new RPCs add an order_holds join table so one order
-- can safely own several inventory holds. Prices and totals are always read
-- from locked server rows, never accepted from the browser.

create table public.order_holds (
  order_id uuid not null references public.orders (id) on delete cascade,
  hold_id uuid not null references public.inventory_holds (id),
  primary key (order_id, hold_id)
);

create index order_holds_hold_idx on public.order_holds (hold_id);

alter table public.order_holds enable row level security;
revoke all on table public.order_holds from public, anon, authenticated;

-- Preserve the relationship for orders created by migrations 0008/0011.
insert into public.order_holds (order_id, hold_id)
select distinct on (hold_id) id, hold_id
from public.orders
where hold_id is not null
order by hold_id, created_at, id
on conflict do nothing;

-- A pre-0017 order could theoretically reference the same hold more than
-- once. Keep the earliest association in the new join table, then prevent
-- that state for all new orders. Those older orders still use their legacy
-- orders.hold_id fallback during payment confirmation.
create unique index order_holds_one_order_per_hold_idx on public.order_holds (hold_id);

-- Create all requested holds in one database transaction. If any ticket type
-- is sold out or violates its limit, PostgreSQL rolls back every hold from the
-- cart instead of leaving a partially-held mixed checkout behind.
create function public.create_ticket_holds(
  p_event_id uuid,
  p_items jsonb,
  p_session_key text
)
returns setof public.inventory_holds
language plpgsql
security definer set search_path = public
as $$
declare
  v_type_ids uuid[];
  v_type_count int;
  v_item_count int;
  v_quantity int;
  v_remaining int;
  v_session_active_qty int;
  v_hold public.inventory_holds;
  v_type public.ticket_types;
begin
  if p_event_id is null or p_session_key is null or length(trim(p_session_key)) = 0 then
    raise exception 'event and session key are required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id and status in ('published', 'sold_out')
  ) then
    raise exception 'event is not available for checkout';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count = 0 or v_item_count > 20 then
    raise exception 'checkout must contain between 1 and 20 ticket types';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(ticket_type_id uuid, quantity int)
    where item.ticket_type_id is null or item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'each ticket selection needs a positive quantity and ticket type';
  end if;
  if exists (
    select item.ticket_type_id
    from jsonb_to_recordset(p_items) as item(ticket_type_id uuid, quantity int)
    group by item.ticket_type_id
    having count(*) > 1
  ) then
    raise exception 'duplicate ticket type';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(ticket_type_id uuid, quantity int)
    group by item.ticket_type_id
    having sum(item.quantity::bigint) > 2147483647
  ) then
    raise exception 'ticket quantity is too large';
  end if;

  select array_agg(distinct item.ticket_type_id order by item.ticket_type_id)
  into v_type_ids
  from jsonb_to_recordset(p_items) as item(ticket_type_id uuid, quantity int);

  select count(*)::int into v_type_count
  from public.ticket_types
  where id = any(v_type_ids);
  if v_type_count <> cardinality(v_type_ids) then
    raise exception 'ticket type not found';
  end if;

  -- Keep the same abuse protection as the single-type RPC, but charge one
  -- attempt for this cart rather than one attempt per selected type.
  if not public.check_rate_limit('create_ticket_holds:' || p_session_key, 8, interval '2 minutes') then
    raise exception 'rate_limited: too many hold attempts, please slow down';
  end if;

  -- Lock all ticket types in a stable order before changing any hold/ledger
  -- rows. This prevents oversells and avoids multi-cart deadlocks.
  for v_type in
    select tt.*
    from public.ticket_types tt
    where tt.id = any(v_type_ids)
    order by tt.id
    for update
  loop
    if v_type.event_id <> p_event_id then
      raise exception 'all ticket types must belong to the selected event';
    end if;

    with expired as (
      update public.inventory_holds
      set status = 'expired'
      where ticket_type_id = v_type.id and status = 'active' and expires_at < now()
      returning id, quantity
    )
    insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, reason)
    select v_type.id, 'release', quantity, id, 'hold expired'
    from expired;

    select coalesce(sum(item.quantity), 0)::int
    into v_quantity
    from jsonb_to_recordset(p_items) as item(ticket_type_id uuid, quantity int)
    where item.ticket_type_id = v_type.id;

    select coalesce(sum(quantity), 0)::int
    into v_session_active_qty
    from public.inventory_holds
    where ticket_type_id = v_type.id
      and session_key = p_session_key
      and status = 'active';

    if v_session_active_qty + v_quantity > v_type.per_order_limit then
      raise exception 'quantity % would exceed per-order limit of % (already holding %)',
        v_quantity, v_type.per_order_limit, v_session_active_qty;
    end if;

    select v_type.capacity - coalesce(sum(
      case when entry_type in ('hold', 'confirm') then quantity
           when entry_type in ('release', 'refund') then -quantity
           else 0 end
    ), 0)
    into v_remaining
    from public.inventory_ledger
    where ticket_type_id = v_type.id;

    if v_remaining < v_quantity then
      raise exception 'sold_out: only % left', greatest(v_remaining, 0);
    end if;

    insert into public.inventory_holds (ticket_type_id, quantity, session_key)
    values (v_type.id, v_quantity, p_session_key)
    returning * into v_hold;

    insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, reason)
    values (v_type.id, 'hold', v_quantity, v_hold.id, 'checkout hold');

    return next v_hold;
  end loop;

  return;
end;
$$;

grant execute on function public.create_ticket_holds(uuid, jsonb, text) to anon, authenticated;

-- Keep the legacy one-hold RPC safe for old clients while recording its hold
-- in the new join table. The hold row is locked before the association check,
-- so two concurrent order attempts cannot consume one hold twice.
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
  v_ticket_type_id uuid;
begin
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return v_existing;
  end if;

  if not public.check_rate_limit('create_pending_order:' || coalesce(p_buyer_phone, p_buyer_email, 'anon'), 10, interval '5 minutes') then
    raise exception 'rate_limited: too many checkout attempts, please slow down';
  end if;

  select ticket_type_id into v_ticket_type_id
  from public.inventory_holds
  where id = p_hold_id;
  if v_ticket_type_id is null then
    raise exception 'hold not found';
  end if;
  perform 1 from public.ticket_types where id = v_ticket_type_id for update;

  select * into v_hold from public.inventory_holds where id = p_hold_id for update;
  if v_hold.id is null then
    raise exception 'hold not found';
  end if;
  if v_hold.status <> 'active' or v_hold.expires_at < now() then
    raise exception 'hold_expired';
  end if;
  if exists (select 1 from public.order_holds where hold_id = v_hold.id)
     or exists (select 1 from public.orders where hold_id = v_hold.id) then
    raise exception 'hold_already_ordered';
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

  insert into public.order_holds (order_id, hold_id)
  values (v_order.id, v_hold.id);
  insert into public.order_items (order_id, ticket_type_id, unit_price_minor, quantity, line_total_minor)
  values (v_order.id, v_ticket_type.id, v_ticket_type.price_minor, v_hold.quantity,
          v_ticket_type.price_minor * v_hold.quantity);

  return v_order;
end;
$$;

grant execute on function public.create_pending_order(uuid, text, text, text) to anon, authenticated;

-- Create one pending order from several server-created holds. The browser sends
-- only opaque hold IDs and contact fields; this function locks the holds and
-- ticket types, verifies event/session ownership, and calculates every line
-- and the order total from current database prices.
create function public.create_pending_order_multi(
  p_hold_ids uuid[],
  p_session_key text,
  p_buyer_email text,
  p_buyer_phone text,
  p_idempotency_key text
)
returns public.orders
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing public.orders;
  v_order public.orders;
  v_hold public.inventory_holds;
  v_ticket_type public.ticket_types;
  v_type_ids uuid[];
  v_event_id uuid;
  v_currency text;
  v_subtotal bigint := 0;
  v_found_count int;
  v_first_hold_id uuid;
  v_reference text;
begin
  if p_hold_ids is null or cardinality(p_hold_ids) = 0
     or p_session_key is null or length(trim(p_session_key)) = 0 then
    raise exception 'holds and session key are required';
  end if;
  if cardinality(p_hold_ids) > 20
     or p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'invalid checkout request';
  end if;
  if exists (
    select requested.hold_id
    from unnest(p_hold_ids) as requested(hold_id)
    group by requested.hold_id having count(*) > 1
  ) then
    raise exception 'duplicate hold';
  end if;

  -- Idempotency is checked before rate limiting so safe retries return the
  -- original server-computed order without consuming another attempt.
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return v_existing;
  end if;

  if not public.check_rate_limit('create_pending_order:' || coalesce(p_buyer_phone, p_buyer_email, 'anon'), 10, interval '5 minutes') then
    raise exception 'rate_limited: too many checkout attempts, please slow down';
  end if;

  select count(*)::int into v_found_count
  from public.inventory_holds
  where id = any(p_hold_ids);
  if v_found_count <> cardinality(p_hold_ids) then
    raise exception 'hold not found';
  end if;

  select array_agg(distinct ih.ticket_type_id order by ih.ticket_type_id)
  into v_type_ids
  from public.inventory_holds ih
  where ih.id = any(p_hold_ids);

  -- Match the lock order used by create_ticket_holds/create_ticket_hold.
  for v_ticket_type in
    select tt.*
    from public.ticket_types tt
    where tt.id = any(v_type_ids)
    order by tt.id
    for update
  loop
    null;
  end loop;

  -- Hold locks are acquired only after ticket-type locks, preventing a mixed
  -- checkout from racing a hold/expiry operation in the opposite order.
  for v_hold in
    select ih.*
    from public.inventory_holds ih
    where ih.id = any(p_hold_ids)
    order by ih.id
    for update
  loop
    if v_hold.status <> 'active' or v_hold.expires_at < now() then
      raise exception 'hold_expired';
    end if;
    if v_hold.session_key is distinct from p_session_key then
      raise exception 'hold_session_mismatch';
    end if;
    if exists (select 1 from public.order_holds where hold_id = v_hold.id)
       or exists (select 1 from public.orders where hold_id = v_hold.id) then
      raise exception 'hold_already_ordered';
    end if;

    select * into v_ticket_type from public.ticket_types where id = v_hold.ticket_type_id;
    if v_event_id is null then
      v_event_id := v_ticket_type.event_id;
      v_currency := v_ticket_type.currency;
      v_first_hold_id := v_hold.id;
    elsif v_ticket_type.event_id <> v_event_id or v_ticket_type.currency <> v_currency then
      raise exception 'all holds must belong to one event and currency';
    end if;
    v_subtotal := v_subtotal + (v_ticket_type.price_minor * v_hold.quantity);
  end loop;

  if not exists (
    select 1 from public.events
    where id = v_event_id and status in ('published', 'sold_out')
  ) then
    raise exception 'event is not available for checkout';
  end if;

  v_reference := 'TY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
  insert into public.orders (
    reference, buyer_id, buyer_email, buyer_phone, event_id, status,
    currency, subtotal_minor, fees_minor, total_minor, idempotency_key, hold_id
  ) values (
    v_reference, auth.uid(), p_buyer_email, p_buyer_phone, v_event_id, 'pending',
    v_currency, v_subtotal, 0, v_subtotal, p_idempotency_key, v_first_hold_id
  ) returning * into v_order;

  insert into public.order_holds (order_id, hold_id)
  select v_order.id, requested.hold_id
  from unnest(p_hold_ids) as requested(hold_id);

  for v_hold in
    select ih.*
    from public.inventory_holds ih
    where ih.id = any(p_hold_ids)
    order by ih.id
  loop
    select * into v_ticket_type from public.ticket_types where id = v_hold.ticket_type_id;
    insert into public.order_items (order_id, ticket_type_id, unit_price_minor, quantity, line_total_minor)
    values (
      v_order.id,
      v_ticket_type.id,
      v_ticket_type.price_minor,
      v_hold.quantity,
      v_ticket_type.price_minor * v_hold.quantity
    );
  end loop;

  return v_order;
end;
$$;

grant execute on function public.create_pending_order_multi(uuid[], text, text, text, text) to anon, authenticated;

-- Extend payment confirmation to convert every hold owned by a multi-item
-- order. The legacy hold_id fallback keeps all pre-0017 orders working.
create or replace function public.confirm_payment_and_issue_tickets(p_payment_id uuid)
returns table (order_id uuid, tickets_issued int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_hold public.inventory_holds;
  v_item record;
  v_already_issued int;
  v_ticket_id uuid;
  v_count int := 0;
  v_has_order_holds boolean;
  v_order_hold_count int;
  v_active_order_hold_count int;
  i int;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment not found';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  select count(*) into v_already_issued
  from public.tickets where public.tickets.order_id = v_order.id;
  if v_already_issued > 0 then
    return query select v_order.id, v_already_issued;
    return;
  end if;

  if v_payment.status = 'succeeded' and v_order.status = 'paid' then
    return query select v_order.id, 0;
    return;
  end if;

  update public.payments set status = 'succeeded', confirmed_at = now() where id = p_payment_id;
  update public.orders set status = 'paid' where id = v_order.id;

  select exists (select 1 from public.order_holds where order_id = v_order.id)
  into v_has_order_holds;

  if v_has_order_holds then
    select count(*)::int,
           count(*) filter (where ih.status = 'active' and ih.expires_at >= now())::int
    into v_order_hold_count, v_active_order_hold_count
    from public.order_holds oh
    join public.inventory_holds ih on ih.id = oh.hold_id
    where oh.order_id = v_order.id;
    if v_order_hold_count = 0 or v_order_hold_count <> v_active_order_hold_count then
      raise exception 'hold_expired';
    end if;

    for v_hold in
      select ih.*
      from public.order_holds oh
      join public.inventory_holds ih on ih.id = oh.hold_id
      where oh.order_id = v_order.id
      order by ih.id
      for update
    loop
      if v_hold.status = 'active' then
        update public.inventory_holds set status = 'confirmed' where id = v_hold.id;
        insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, order_id, reason)
        values (v_hold.ticket_type_id, 'release', v_hold.quantity, v_hold.id, v_order.id, 'converted to confirmed sale');
        insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, order_id, reason)
        values (v_hold.ticket_type_id, 'confirm', v_hold.quantity, v_hold.id, v_order.id, 'payment succeeded');
      end if;
    end loop;
  elsif v_order.hold_id is not null then
    select * into v_hold from public.inventory_holds where id = v_order.hold_id for update;
    if v_hold.id is not null and v_hold.status = 'active' then
      update public.inventory_holds set status = 'confirmed' where id = v_hold.id;
      insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, order_id, reason)
      values (v_hold.ticket_type_id, 'release', v_hold.quantity, v_hold.id, v_order.id, 'converted to confirmed sale');
      insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, hold_id, order_id, reason)
      values (v_hold.ticket_type_id, 'confirm', v_hold.quantity, v_hold.id, v_order.id, 'payment succeeded');
    end if;
  end if;

  for v_item in select * from public.order_items where public.order_items.order_id = v_order.id loop
    i := 0;
    while i < v_item.quantity loop
      insert into public.tickets (order_id, order_item_id, ticket_type_id, event_id)
      values (v_order.id, v_item.id, v_item.ticket_type_id, v_order.event_id)
      returning id into v_ticket_id;
      v_count := v_count + 1;
      i := i + 1;
    end loop;
  end loop;

  insert into public.notifications (order_id, recipient_profile_id, channel, template, status)
  values (v_order.id, v_order.buyer_id, 'email', 'ticket_confirmation', 'queued');

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'confirm_payment_and_issue_tickets', 'order', v_order.id,
          jsonb_build_object('payment_id', p_payment_id, 'tickets_issued', v_count));

  return query select v_order.id, v_count;
end;
$$;

revoke execute on function public.confirm_payment_and_issue_tickets(uuid) from public, anon, authenticated;

-- Failed/cancelled payment must release every hold in a mixed order. The
-- legacy hold_id branch keeps pre-0017 orders and any manually-created order
-- compatible with the original schema.
create or replace function public.fail_payment(p_payment_id uuid, p_reason text default 'payment failed')
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_hold public.inventory_holds;
  v_has_order_holds boolean;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment not found';
  end if;

  update public.payments set status = 'failed' where id = p_payment_id;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  update public.orders set status = 'failed' where id = v_order.id;

  select exists (select 1 from public.order_holds where order_id = v_order.id)
  into v_has_order_holds;
  if v_has_order_holds then
    for v_hold in
      select ih.*
      from public.order_holds oh
      join public.inventory_holds ih on ih.id = oh.hold_id
      where oh.order_id = v_order.id
      order by ih.id
      for update
    loop
      perform public.release_hold(v_hold.id, p_reason);
    end loop;
  elsif v_order.hold_id is not null then
    perform public.release_hold(v_order.hold_id, p_reason);
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'fail_payment', 'order', v_order.id,
          jsonb_build_object('payment_id', p_payment_id, 'reason', p_reason));
end;
$$;

revoke execute on function public.fail_payment(uuid, text) from public, anon, authenticated;
