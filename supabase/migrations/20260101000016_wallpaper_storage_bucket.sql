-- Ticketyangu — 0016: storage bucket for the landing-page wallpaper
--
-- HONESTY NOTE, read before running: every other migration in this project
-- was tested against a real local Postgres before shipping. This one
-- can't be — Supabase Storage is a separate service with its own
-- `storage` schema (buckets, objects, RLS-style policies on
-- storage.objects) that only exists on an actual Supabase project, not on
-- a plain `apt install postgresql`. This migration is written against
-- Supabase's documented Storage schema and the same is_platform_staff()
-- pattern used everywhere else in this project, but run it against a real
-- (ideally staging) Supabase project and upload a test image through the
-- app before trusting it in production.

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- Public read (the wallpaper needs to load for every visitor, logged in
-- or not) — anyone can view files in this bucket.
create policy "site-assets: public read"
  on storage.objects for select
  using (bucket_id = 'site-assets');

-- Only platform staff can upload, replace, or delete — reuses the same
-- helper function every other staff-only policy in this project uses.
create policy "site-assets: staff upload"
  on storage.objects for insert
  with check (bucket_id = 'site-assets' and public.is_platform_staff());

create policy "site-assets: staff update"
  on storage.objects for update
  using (bucket_id = 'site-assets' and public.is_platform_staff());

create policy "site-assets: staff delete"
  on storage.objects for delete
  using (bucket_id = 'site-assets' and public.is_platform_staff());
