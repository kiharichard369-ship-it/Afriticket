-- Ticketyangu — 0010: payment confirmation, ticket issuance, check-in, refunds
--
-- These functions are the atomic core of Phase 3. They are deliberately the
-- ONLY way orders move to 'paid', tickets get issued, and check-ins happen —
-- there is no path for the browser to do any of this by writing rows
-- directly (see the RLS section at the bottom: no INSERT/UPDATE policies
-- are added for orders/payments/tickets/checkins). Edge Functions call
-- these using the service role or the buyer's own JWT, per function.

-- ── 1. Record that payment was initiated ─────────────────────────────────
-- Called by the initiate-payment Edge Function right after it gets a
-- CheckoutRequestID (or a mock reference) back from the provider.
create function public.record_payment_initiation(
  p_order_id uuid,
  p_provider text,
  p_provider_reference text,
  p_amount_minor bigint
)
returns public.payments
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_payment public.payments;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order not found';
  end if;
  if v_order.status not in ('pending', 'awaiting_payment', 'failed') then
    raise exception 'order is not payable in its current status: %', v_order.status;
  end if;

  insert into public.payments (order_id, provider, provider_reference, amount_minor, status)
  values (p_order_id, p_provider, p_provider_reference, p_amount_minor, 'initiated')
  returning * into v_payment;

  update public.orders set status = 'awaiting_payment' where id = p_order_id;

  return v_payment;
end;
$$;

-- ── 2. Confirm payment, convert the hold, issue tickets ──────────────────
-- Idempotent: safe to call twice for the same payment (e.g. a duplicate
-- webhook) — the second call is a no-op that returns the already-issued
-- ticket count instead of issuing a second batch.
create function public.confirm_payment_and_issue_tickets(p_payment_id uuid)
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
  i int;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment not found';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;

  -- Idempotency: if tickets already exist for this order, this webhook
  -- fired more than once. Return the existing count rather than double-issue.
  select count(*) into v_already_issued from public.tickets where public.tickets.order_id = v_order.id;
  if v_already_issued > 0 then
    return query select v_order.id, v_already_issued;
    return;
  end if;

  if v_payment.status = 'succeeded' and v_order.status = 'paid' then
    return query select v_order.id, 0; -- already processed, nothing to issue (shouldn't normally hit this)
    return;
  end if;

  update public.payments set status = 'succeeded', confirmed_at = now() where id = p_payment_id;
  update public.orders set status = 'paid' where id = v_order.id;

  if v_order.hold_id is not null then
    select * into v_hold from public.inventory_holds where id = v_order.hold_id for update;
    if v_hold.id is not null and v_hold.status = 'active' then
      -- Convert the hold to a confirmed sale: release the hold, then log
      -- the confirm. Net effect on availability is zero (a hold already
      -- counted against capacity) — this just makes the ledger's audit
      -- trail explicit about *why* the seats are now permanently gone.
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

-- ── 3. Payment failed / cancelled: release the hold, free the seats ──────
create function public.fail_payment(p_payment_id uuid, p_reason text default 'payment failed')
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payment public.payments;
  v_order public.orders;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment not found';
  end if;

  update public.payments set status = 'failed' where id = p_payment_id;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  update public.orders set status = 'failed' where id = v_order.id;

  if v_order.hold_id is not null then
    perform public.release_hold(v_order.hold_id, p_reason);
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (null, 'system', 'fail_payment', 'order', v_order.id, jsonb_build_object('payment_id', p_payment_id, 'reason', p_reason));
end;
$$;

-- ── 4. Check-in: atomic ticket validation ────────────────────────────────
-- Returns one of: valid, already_used, cancelled, refunded, wrong_event,
-- expired, not_found. Locks the ticket row so two scanners can never both
-- get "valid" for the same ticket.
--
-- Takes no p_scanned_by parameter on purpose — it always uses auth.uid()
-- for both the authorization check and the checkins.scanned_by value, so a
-- caller can't spoof who scanned it. It also checks the caller actually
-- holds check-in rights on p_event_id before doing anything else; without
-- that check, any authenticated user could mark any event's tickets used.
create function public.check_in_ticket(p_public_code text, p_event_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_result text;
begin
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','checkin_staff']::organisation_role[])
  ) then
    raise exception 'not authorized to check in tickets for this event';
  end if;

  select * into v_ticket from public.tickets where public_code = p_public_code for update;

  if v_ticket.id is null then
    v_result := 'not_found';
  elsif v_ticket.event_id <> p_event_id then
    v_result := 'wrong_event';
  elsif v_ticket.status = 'used' then
    v_result := 'already_used';
  elsif v_ticket.status = 'cancelled' then
    v_result := 'cancelled';
  elsif v_ticket.status = 'refunded' then
    v_result := 'refunded';
  elsif v_ticket.status = 'expired' then
    v_result := 'expired';
  else
    v_result := 'valid';
    update public.tickets set status = 'used', checked_in_at = now() where id = v_ticket.id;
  end if;

  insert into public.checkins (ticket_id, scanned_by, result)
  values (v_ticket.id, auth.uid(), v_result);

  return v_result;
end;
$$;

-- Privileged reversal: undo a mistaken check-in. Requires check-in staff
-- role on the ticket's event (enforced by the caller checking
-- has_organisation_role before calling, and re-checked here).
create function public.reverse_check_in(p_ticket_id uuid, p_reversed_by uuid, p_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_event_id uuid;
begin
  select event_id into v_event_id from public.tickets where id = p_ticket_id;
  if v_event_id is null then
    raise exception 'ticket not found';
  end if;
  if not exists (
    select 1 from public.events e
    where e.id = v_event_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','checkin_staff']::organisation_role[])
  ) then
    raise exception 'not authorized';
  end if;

  update public.tickets set status = 'valid', checked_in_at = null where id = p_ticket_id;
  insert into public.checkins (ticket_id, scanned_by, result, is_reversal, reversal_reason)
  values (p_ticket_id, p_reversed_by, 'valid', true, p_reason);
end;
$$;

-- ── 5. Refunds ────────────────────────────────────────────────────────────
create function public.request_refund(p_order_id uuid, p_reason text)
returns public.refunds
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_refund public.refunds;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order not found';
  end if;
  if v_order.buyer_id is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'only paid orders can be refunded, current status: %', v_order.status;
  end if;

  insert into public.refunds (order_id, amount_minor, reason, requested_by)
  values (p_order_id, v_order.total_minor, p_reason, auth.uid())
  returning * into v_refund;

  update public.orders set status = 'refund_requested' where id = p_order_id;

  return v_refund;
end;
$$;

-- Approving a refund here marks it approved and cancels the tickets; it
-- does NOT call a payment provider to actually send money back — that's
-- the payment adapter's refund() method, called by an Edge Function after
-- this succeeds. This function is the inventory/ticket side of a refund.
create function public.approve_refund(p_refund_id uuid, p_approved_by uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_refund public.refunds;
  v_order public.orders;
  v_ticket record;
begin
  if not public.is_platform_staff() and not exists (
    select 1 from public.refunds r
    join public.orders o on o.id = r.order_id
    join public.events e on e.id = o.event_id
    where r.id = p_refund_id
      and public.has_organisation_role(e.organisation_id, array['owner','manager','finance']::organisation_role[])
  ) then
    raise exception 'not authorized';
  end if;

  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null then
    raise exception 'refund not found';
  end if;

  select * into v_order from public.orders where id = v_refund.order_id for update;

  update public.refunds set status = 'approved', approved_by = p_approved_by where id = p_refund_id;
  update public.orders set status = 'refunded' where id = v_order.id;

  for v_ticket in select * from public.tickets where public.tickets.order_id = v_order.id loop
    update public.tickets set status = 'refunded' where id = v_ticket.id;
    insert into public.inventory_ledger (ticket_type_id, entry_type, quantity, order_id, reason)
    values (v_ticket.ticket_type_id, 'refund', 1, v_order.id, 'refund approved');
  end loop;

  insert into public.notifications (order_id, recipient_profile_id, channel, template, status)
  values (v_order.id, v_order.buyer_id, 'email', 'refund_confirmation', 'queued');

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (p_approved_by, 'staff_or_organiser', 'approve_refund', 'order', v_order.id, jsonb_build_object('refund_id', p_refund_id));
end;
$$;

grant execute on function public.check_in_ticket(text, uuid) to authenticated;
grant execute on function public.reverse_check_in(uuid, uuid, text) to authenticated;
grant execute on function public.request_refund(uuid, text) to authenticated;
grant execute on function public.approve_refund(uuid, uuid) to authenticated;
-- record_payment_initiation, confirm_payment_and_issue_tickets, and
-- fail_payment are called only by Edge Functions using the service role —
-- never directly from the browser, since they trust their inputs as
-- already-verified (a provider webhook, or a server-side payment call).
revoke execute on function public.record_payment_initiation(uuid, text, text, bigint) from public, anon, authenticated;
revoke execute on function public.confirm_payment_and_issue_tickets(uuid) from public, anon, authenticated;
revoke execute on function public.fail_payment(uuid, text) from public, anon, authenticated;

-- Note: refunds are created only via request_refund() above (SECURITY
-- DEFINER, bypasses RLS) — no direct INSERT policy is added here on
-- purpose. A direct-insert policy would let a buyer write an arbitrary
-- amount_minor themselves, bypassing request_refund()'s own-order and
-- paid-status checks.
