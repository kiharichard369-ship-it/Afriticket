-- Afriticket — 0025: recover paid guest checkouts
-- A guest may complete payment using an email address, but tickets are normally
-- scoped to buyer_id. This lets a signed-in owner of that email claim only
-- their own paid, previously unclaimed orders.

create or replace function public.claim_paid_guest_orders()
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_email_confirmed boolean;
  v_claimed int;
begin
  select lower(trim(coalesce(email, ''))), email_confirmed_at is not null
  into v_email, v_email_confirmed
  from auth.users
  where id = auth.uid();
  if v_email = '' or not coalesce(v_email_confirmed, false) then
    return 0;
  end if;

  update public.orders
  set buyer_id = auth.uid(), updated_at = now()
  where buyer_id is null
    and status = 'paid'
    and buyer_email is not null
    and lower(trim(buyer_email)) = v_email;

  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$$;

revoke all on function public.claim_paid_guest_orders() from public, anon;
grant execute on function public.claim_paid_guest_orders() to authenticated;
