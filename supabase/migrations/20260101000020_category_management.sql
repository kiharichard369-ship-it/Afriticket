-- Afriticket — 0020: moderator category management
-- Categories are public catalog data, but only platform staff may create them.
-- Event posters select from the same public categories table.

create or replace function public.create_category(p_name text)
returns public.categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_slug_base text;
  v_slug text;
  v_suffix int := 0;
  v_category public.categories;
begin
  if not public.is_platform_staff() then
    raise exception 'not authorized';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'category name must be between 2 and 80 characters';
  end if;
  if exists (select 1 from public.categories where lower(name) = lower(v_name)) then
    raise exception 'a category with that name already exists';
  end if;

  v_slug_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then
    raise exception 'category name must contain letters or numbers';
  end if;
  v_slug := v_slug_base;
  while exists (select 1 from public.categories where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_slug_base || '-' || v_suffix;
  end loop;

  insert into public.categories (slug, name, sort_order)
  values (v_slug, v_name, coalesce((select max(sort_order) + 1 from public.categories), 0))
  returning * into v_category;
  return v_category;
end;
$$;

grant execute on function public.create_category(text) to authenticated;
