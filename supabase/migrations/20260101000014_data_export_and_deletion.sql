-- Ticketyangu — 0014: data export and account deletion
--
-- "Right to erasure" has a well-established exception for records a
-- business is legally required to keep (tax/accounting records, fraud and
-- dispute evidence). So account deletion here is a targeted anonymization,
-- not a row-level delete: PII (name, phone) is cleared and the account is
-- marked 'deleted', but orders/payments/tickets rows survive intact for
-- accounting retention — they're no longer traceable to a real identity
-- once buyer_id's profile is anonymized, which is the actual privacy goal.
-- Confirm your own retention period with a lawyer before launch; this
-- implements "anonymize now, keep records", not a specific number of days.

create function public.export_my_data()
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'id' from public.profiles p where p.id = v_uid),
    'organisation_memberships', (
      select coalesce(jsonb_agg(jsonb_build_object('organisation_name', o.name, 'role', m.role, 'since', m.created_at)), '[]'::jsonb)
      from public.organisation_members m join public.organisations o on o.id = m.organisation_id
      where m.user_id = v_uid
    ),
    'orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'reference', o.reference, 'status', o.status, 'total_minor', o.total_minor,
        'currency', o.currency, 'created_at', o.created_at
      )), '[]'::jsonb)
      from public.orders o where o.buyer_id = v_uid
    ),
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_title', e.title, 'status', t.status, 'issued_at', t.issued_at, 'backup_code', t.backup_code
      )), '[]'::jsonb)
      from public.tickets t
      join public.orders o on o.id = t.order_id
      join public.events e on e.id = t.event_id
      where o.buyer_id = v_uid
    )
  );
end;
$$;

create function public.request_account_deletion()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1 from public.organisation_members m
    where m.user_id = v_uid and m.role = 'owner'
  ) then
    raise exception 'transfer or close your organisation(s) before deleting your account — contact support';
  end if;

  update public.profiles
  set full_name = null, phone = null, status = 'deleted'
  where id = v_uid;

  -- Buyer-identifying free-text fields on past orders are cleared too;
  -- the order rows themselves (amounts, status, timestamps) stay for
  -- accounting retention, per the migration header.
  update public.orders set buyer_email = null, buyer_phone = null where buyer_id = v_uid;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (v_uid, 'self', 'request_account_deletion', 'profile', v_uid, '{}'::jsonb);
end;
$$;

grant execute on function public.export_my_data() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
