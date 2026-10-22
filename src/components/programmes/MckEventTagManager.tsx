// Location: src/components/programmes/MckEventTagManager.tsx
// Platform-admin event-tag controls; event rows remain in Afriticket's existing events table.
import { useEffect, useMemo, useState } from "react";
import { Search, Tag } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { MCK_PROGRAMME_SLUG } from "../../data/mckPartnershipTiers";
import { listMckAdminEvents, setMckEventTag } from "../../repositories/mckProgrammeRepository";
import type { MckAdminEventRow } from "../../types/database";

function eventDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not set" : new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function MckEventTagManager() {
  const [events, setEvents] = useState<MckAdminEventRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    listMckAdminEvents()
      .then((rows) => { if (active) setEvents(rows); })
      .catch(() => { if (active) setError("Events could not be loaded. Confirm migration 0028 is applied and this account has the platform-admin role."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken]);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? events.filter((event) => event.title.toLowerCase().includes(normalized) || event.slug.toLowerCase().includes(normalized)) : events;
  }, [events, query]);

  async function toggle(event: MckAdminEventRow) {
    const nextSlug = event.programme_slug === MCK_PROGRAMME_SLUG ? null : MCK_PROGRAMME_SLUG;
    setBusyId(event.id);
    setError(null);
    setMessage(null);
    try {
      await setMckEventTag(event.id, nextSlug);
      setEvents((current) => current.map((row) => row.id === event.id ? { ...row, programme_slug: nextSlug } : row));
      setMessage(nextSlug ? `“${event.title}” is tagged for MCK discovery.` : `The MCK tag was removed from “${event.title}”.`);
    } catch {
      setError("The programme tag was not saved. Confirm migration 0028 and your platform-admin role.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink dark:text-ink-dark">Afriticket event association</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft dark:text-ink-soft-dark">Tag an existing event only when it is formally part of Miss Corporate Kenya. Organisers can also set the tag in the event create/edit form.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" aria-label="Search event titles and slugs" className="pl-9" />
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rust/30 bg-rust/5 p-3 text-sm text-rust">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg border border-sage/30 bg-sage/5 p-3 text-sm text-sage">{message}</p>}
      {loading ? <p className="mt-5 text-sm text-ink-faint">Loading events…</p> : visibleEvents.length === 0 ? <p className="mt-5 text-sm text-ink-faint">{events.length ? "No events match this search." : "No Afriticket events are available yet."}</p> : (
        <div className="mt-4 divide-y divide-border-warm dark:divide-border-dark">
          {visibleEvents.map((event) => {
            const tagged = event.programme_slug === MCK_PROGRAMME_SLUG;
            return (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-ink dark:text-ink-dark">{event.title}</h3>
                  <p className="mt-1 break-all text-xs text-ink-faint">{event.slug} · {event.status.replaceAll("_", " ")} · {eventDate(event.starts_at)}</p>
                </div>
                <Button type="button" variant={tagged ? "secondary" : "outline"} size="sm" disabled={busyId === event.id} onClick={() => void toggle(event)} aria-pressed={tagged}>
                  <Tag className="h-4 w-4" aria-hidden="true" /> {busyId === event.id ? "Saving…" : tagged ? "Remove MCK tag" : "Tag as MCK event"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-5 text-xs leading-relaxed text-ink-faint dark:text-ink-soft-dark">Only published or sold-out events appear in public discovery. Draft and review-state tags remain private until the existing event is published.</p>
      <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => { setError(null); setLoading(true); setRefreshToken((value) => value + 1); }} className="mt-3">Refresh event list</Button>
    </Card>
  );
}
