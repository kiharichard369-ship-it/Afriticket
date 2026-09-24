-- Ticketyangu — 0002: catalog

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete set null,
  name text not null,
  town text not null,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz not null default now()
);

create index venues_town_idx on public.venues (town);

create type event_status as enum (
  'draft', 'pending_review', 'published', 'paused', 'sold_out', 'completed', 'cancelled', 'archived'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  venue_id uuid not null references public.venues (id),
  slug text not null unique,
  title text not null,
  description text not null default '',
  status event_status not null default 'draft',
  cover_image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Africa/Nairobi',
  is_free boolean not null default false,
  moderation_reason text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_status_starts_at_idx on public.events (status, starts_at);
create index events_organisation_idx on public.events (organisation_id);
create index events_category_idx on public.events (category_id);

create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity_override int
);

create table public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  is_cover boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.event_policies (
  event_id uuid primary key references public.events (id) on delete cascade,
  age_limit text,
  accessibility_notes text,
  refund_policy_summary text,
  entry_rules text
);

create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger organisations_set_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();
