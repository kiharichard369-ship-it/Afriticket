-- Afriticket — 0021: platform role management
-- Platform administrators can grant, update, list, and revoke platform roles
-- without editing platform_staff manually in the Supabase SQL editor.

create or replace function public.is_platform_staff(min_role platform_role default 'support')
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_staff
    where user_id = auth.uid()
      and case min_role
        when 'support' then role in ('support', 'moderator', 'admin')
        when 'moderator' then role in ('moderator', 'admin')
        when 'admin' then role = 'admin'
      end
  );
$$;

create or replace function public.list_platform_staff()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role platform_role,
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
  select au.id, au.email::text, p.full_name, ps.role, ps.created_at
  from auth.users au
  join public.platform_staff ps on ps.user_id = au.id
  left join public.profiles p on p.id = au.id
  order by au.email;
end;
$$;

grant execute on function public.list_platform_staff() to authenticated;

create or replace function public.grant_platform_role(p_email text, p_role platform_role)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role platform_role,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public, auth
as $$
declare
  target auth.users;
  saved public.platform_staff;
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;

  select * into target
  from auth.users
  where lower(email) = lower(trim(p_email));

  if target.id is null then
    raise exception 'no account found for that email';
  end if;

  insert into public.platform_staff (user_id, role)
  values (target.id, p_role)
  on conflict (user_id) do update set role = excluded.role
  returning * into saved;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform_staff', 'grant_platform_role', 'profile', target.id,
          jsonb_build_object('email', target.email, 'role', p_role));

  return query
  select target.id, target.email::text, p.full_name, saved.role, saved.created_at
  from public.profiles p
  where p.id = target.id;
end;
$$;

grant execute on function public.grant_platform_role(text, platform_role) to authenticated;

create or replace function public.revoke_platform_role(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  removed_role platform_role;
begin
  if not public.is_platform_staff('admin') then
    raise exception 'not authorized';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'you cannot remove your own platform role';
  end if;

  select role into removed_role from public.platform_staff where user_id = p_user_id;
  if removed_role is null then
    raise exception 'platform role not found';
  end if;
  if removed_role = 'admin' and (select count(*) from public.platform_staff where role = 'admin') <= 1 then
    raise exception 'cannot remove the last administrator';
  end if;

  delete from public.platform_staff where user_id = p_user_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'platform_staff', 'revoke_platform_role', 'profile', p_user_id,
          jsonb_build_object('role', removed_role));
end;
$$;

grant execute on function public.revoke_platform_role(uuid) to authenticated;
