-- Ticketyangu — 0009: event status transition guard
--
-- The "organisers update own" RLS policy from migration 0007 lets an
-- organiser UPDATE any column on their own event, including status — which
-- would let them set status = 'published' directly, skipping moderation
-- entirely. RLS policies can't compare old vs new column values, so this
-- closes the gap with a trigger instead.

create function public.enforce_event_status_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Platform staff (and the service role, which bypasses triggers-via-RLS
  -- checks anyway) can move an event to any status — that's moderation.
  if public.is_platform_staff() then
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'pending_review' then
    return new;
  end if;

  if old.status = 'pending_review' and new.status = 'draft' then
    return new; -- organiser withdraws their own submission
  end if;

  if old.status = 'published' and new.status in ('paused', 'cancelled') then
    return new;
  end if;

  if old.status = 'paused' and new.status in ('published', 'cancelled') then
    return new; -- organiser resumes or cancels their own already-approved event
  end if;

  if old.status = 'completed' and new.status = 'archived' then
    return new;
  end if;

  raise exception 'organisers cannot change status from % to % directly — that transition needs platform review', old.status, new.status;
end;
$$;

create trigger events_enforce_status_transition
  before update of status on public.events
  for each row execute function public.enforce_event_status_transition();

-- Staff had an UPDATE bypass (migration 0007) but no SELECT policy for
-- non-public statuses, so they could never actually see a pending_review
-- event to moderate it in the first place.
create policy "events: platform staff read all" on public.events for select
  using (public.is_platform_staff());
