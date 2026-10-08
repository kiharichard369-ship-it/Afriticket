// Save as: src/pages/SupportCheckinPage.tsx   (route: /staff/checkin)
//
// For support staff (and admins): pick the event you're working at, then open the
// usual check-in screen. Reads only the PUBLIC event list, so support needs no
// access to private event data.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScanLine } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { formatEventDate, formatEventTime } from "../lib/date";

interface CheckinEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  venue_town: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function SupportCheckinPage() {
  const [events, setEvents] = useState<CheckinEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!supabase) return;
    const now = Date.now();
    supabase
      .from("events_public")
      .select("id, title, starts_at, ends_at, venue_name, venue_town")
      // Still on, or ended less than a day ago (or no end time), and not ancient.
      .or(`ends_at.gte.${new Date(now - DAY_MS).toISOString()},ends_at.is.null`)
      .gte("starts_at", new Date(now - 45 * DAY_MS).toISOString())
      .order("starts_at", { ascending: true })
      .limit(200)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setEvents((data ?? []) as CheckinEvent[]);
      });
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!events) return [];
    if (!term) return events;
    return events.filter((event) => `${event.title} ${event.venue_name ?? ""} ${event.venue_town ?? ""}`.toLowerCase().includes(term));
  }, [events, search]);

  const now = Date.now();
  const isOnNow = (event: CheckinEvent) => {
    const start = new Date(event.starts_at).getTime();
    const end = event.ends_at ? new Date(event.ends_at).getTime() : start + 12 * 60 * 60 * 1000;
    return start <= now && end >= now;
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Event check-in</h1>
      <p className="mt-1 text-ink-soft dark:text-ink-soft-dark">
        Choose the event you're working at, then scan or type each guest's ticket code at the entrance.
      </p>

      <div className="mt-6">
        <Input aria-label="Search events" placeholder="Search by event or venue…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}

      <div className="mt-6 space-y-3">
        {events === null && !error ? (
          <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-ink-soft dark:text-ink-soft-dark">{search ? "No events match that search." : "No events are on right now."}</p>
        ) : (
          visible.map((event) => (
            <Card key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink dark:text-ink-dark">{event.title}</span>
                  {isOnNow(event) && <Badge tone="saffron">On now</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
                  {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
                  {event.venue_name && ` · ${event.venue_name}${event.venue_town ? `, ${event.venue_town}` : ""}`}
                </p>
              </div>
              <Link to={`/staff/events/${event.id}/checkin`}>
                <Button size="sm"><ScanLine aria-hidden="true" className="h-4 w-4" /> Open check-in</Button>
              </Link>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}