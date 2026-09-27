-- Afriticket — 0022: platform role audit view
-- Exposes only role-management audit entries to platform administrators,
-- enriched with actor and target account details for the admin dashboard.

create or replace function public.list_platform_role_audit(p_limit int default 50)
returns table (
  id uuid,
  actor_id uuid,
  actor_email text,
  action text,
  target_user_id uuid,
  target_email text,
  target_full_name text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public, auth
stable
as $$
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;

  return query
  select
    al.id,
    al.actor_id,
    actor.email::text,
    al.action,
    al.entity_id,
    target.email::text,
    target_profile.full_name,
    al.metadata,
    al.created_at
  from public.audit_logs al
  left join auth.users actor on actor.id = al.actor_id
  left join auth.users target on target.id = al.entity_id
  left join public.profiles target_profile on target_profile.id = al.entity_id
  where al.entity_type = 'profile'
    and al.action in ('grant_platform_role', 'revoke_platform_role')
  order by al.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

grant execute on function public.list_platform_role_audit(int) to authenticated;
