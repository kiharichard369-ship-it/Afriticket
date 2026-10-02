-- Afriticket — 0026: recover ticket issuance for confirmed payments
-- Re-runs of the confirmation RPC issue tickets when a prior callback committed
-- the payment/order status but failed before ticket creation.

alter table public.payments
  add column if not exists mpesa_receipt_number text;
create index if not exists payments_mpesa_receipt_idx
  on public.payments (mpesa_receipt_number)
  where mpesa_receipt_number is not null;

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
    insert into public.notifications (order_id, recipient_profile_id, channel, template, status)
    select v_order.id, v_order.buyer_id, 'email', 'ticket_confirmation', 'queued'
    where not exists (
      select 1 from public.notifications n
      where n.order_id = v_order.id
        and n.channel = 'email'
        and n.template = 'ticket_confirmation'
        and n.status in ('queued', 'sent', 'delivered')
    );
    return query select v_order.id, v_already_issued;
    return;
  end if;

  -- A prior callback may have marked the payment paid before ticket rows were
  -- created. Continue issuing tickets in that case; the existing ticket-count
  -- guard above keeps successful retries idempotent.
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
