-- Afriticket — 0023: event-driven landing theme
-- Platform staff can temporarily use a published event's cover image as the
-- landing background. Public rendering also falls back to the nearest event
-- starting within seven days when it has a cover image.

do $$
begin
  if to_regclass('public.site_settings') is null or to_regclass('public.events') is null then
    raise exception 'Migration 0023 requires site_settings and events. Apply migrations 0001–0015 first.';
  end if;
end
$$;

alter table public.site_settings
  add column if not exists landing_theme_event_id uuid references public.events (id) on delete set null,
  add column if not exists landing_theme_event_until timestamptz;

create index if not exists site_settings_landing_theme_event_idx
  on public.site_settings (landing_theme_event_id, landing_theme_event_until);
