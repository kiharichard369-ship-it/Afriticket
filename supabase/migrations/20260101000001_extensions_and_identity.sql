-- Ticketyangu — 0001: extensions and identity
-- Users live in Supabase's own auth.users table. Everything here extends it.

create extension if not exists "pgcrypto";

create type user_status as enum ('active', 'suspended', 'deleted');

-- One row per authenticated user, created by the handle_new_user trigger below.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text unique,
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Buyer/organiser/staff profile data, one row per auth.users id.';

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  trading_name text,
  support_email text,
  support_phone text,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type organisation_role as enum ('owner', 'manager', 'editor', 'finance', 'checkin_staff');

create table public.organisation_members (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role organisation_role not null,
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create type platform_role as enum ('support', 'moderator', 'admin');

create table public.platform_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role platform_role not null,
  created_at timestamptz not null default now()
);

-- Keep profiles in sync with auth.users on signup.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email_verified)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email_confirmed_at is not null)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_platform_staff(min_role platform_role default 'support')
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.platform_staff
    where user_id = auth.uid()
  );
$$;

create function public.has_organisation_role(org_id uuid, roles organisation_role[])
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.organisation_members
    where organisation_id = org_id
      and user_id = auth.uid()
      and role = any(roles)
  );
$$;
