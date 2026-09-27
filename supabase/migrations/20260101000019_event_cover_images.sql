-- Afriticket — 0019: organiser event cover-image storage
-- Event images live in the existing public site-assets bucket. The object name
-- starts with events/<event-id>/ so Storage RLS can verify ownership without
-- exposing service-role credentials to the browser.
do $$
begin
  if to_regclass('public.events') is null then
    raise exception 'Migration 0019 requires public.events. Apply migrations 20260101000001 through 20260101000014 first, then 0015–0018.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'site-assets') then
    raise exception 'Migration 0019 requires the site-assets bucket. Apply migration 0016 first.';
  end if;
end
$$;
drop policy if exists "site-assets: organisers upload event images" on storage.objects;
create policy "site-assets: organisers upload event images"
  on storage.objects for insert
  with check (
    bucket_id = 'site-assets'
    and name ~ '^events/[0-9a-fA-F-]{36}/[a-zA-Z0-9._-]+$'
    and exists (
      select 1
      from public.events e
      where e.id = split_part(name, '/', 2)::uuid
        and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])
    )
  );

drop policy if exists "site-assets: organisers update event images" on storage.objects;
create policy "site-assets: organisers update event images"
  on storage.objects for update
  using (
    bucket_id = 'site-assets'
    and name ~ '^events/[0-9a-fA-F-]{36}/[a-zA-Z0-9._-]+$'
    and exists (
      select 1
      from public.events e
      where e.id = split_part(name, '/', 2)::uuid
        and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])
    )
  );

drop policy if exists "site-assets: organisers delete event images" on storage.objects;
create policy "site-assets: organisers delete event images"
  on storage.objects for delete
  using (
    bucket_id = 'site-assets'
    and name ~ '^events/[0-9a-fA-F-]{36}/[a-zA-Z0-9._-]+$'
    and exists (
      select 1
      from public.events e
      where e.id = split_part(name, '/', 2)::uuid
        and public.has_organisation_role(e.organisation_id, array['owner','manager','editor']::organisation_role[])
    )
  );
