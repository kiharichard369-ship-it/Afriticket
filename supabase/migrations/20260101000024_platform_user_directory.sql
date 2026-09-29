-- Afriticket — 0024: platform user directory
-- Lets platform administrators review registered accounts and assign roles from
-- the dashboard without opening the Supabase table editor.

create or replace function public.list_platform_users(p_search text default null)
returns table (
  user_id uuid,
  email text,
  full_name text,
  account_status user_status,
  registered_at timestamptz,
  role platform_role
)
language plpgsql
security definer set search_path = public, auth
stable
as $$
  declare
    search_term text := nullif(trim(p_search), '');
  begin
    if not public.is_platform_staff('admin') then
      raise exception 'not authorized';
    end if;

    return query
    select
      au.id,
      au.email::text,
      p.full_name,
      p.status,
      au.created_at,
      ps.role
    from auth.users au
    left join public.profiles p on p.id = au.id
    left join public.platform_staff ps on ps.user_id = au.id
    where search_term is null
      or lower(coalesce(au.email, '')) like '%' || lower(search_term) || '%'
      or lower(coalesce(p.full_name, '')) like '%' || lower(search_term) || '%'
    order by au.created_at desc
    limit 200;
  end;
$$;

grant execute on function public.list_platform_users(text) to authenticated;
