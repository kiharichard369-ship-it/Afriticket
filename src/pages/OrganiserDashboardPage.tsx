import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useOrganisation } from "../hooks/useOrganisation";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { formatEventDate } from "../lib/date";
import type { EventRow } from "../types/database";

const STATUS_TONE: Record<string, "saffron" | "sage" | "rust" | "neutral"> = {
  draft: "neutral",
  pending_review: "saffron",
  published: "sage",
  paused: "rust",
  sold_out: "neutral",
  completed: "neutral",
  cancelled: "rust",
  archived: "neutral",
};

export function OrganiserDashboardPage() {
  const { membership } = useOrganisation();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    if (!supabase || !membership) return;
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("organisation_id", membership.organisation_id)
      .order("created_at", { ascending: false });
    setEvents((data as EventRow[]) ?? []);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership]);

  async function transition(eventId: string, status: string) {
    if (!supabase) return;
    setBusyId(eventId);
    const { error } = await supabase.from("events").update({ status }).eq("id", eventId);
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">
            {membership?.organisation?.name ?? "Your events"}
          </h1>
          <p className="mt-1 text-ink-soft dark:text-ink-soft-dark">
            {membership?.role === "owner" ? "Owner" : membership?.role} access
          </p>
        </div>
        <Link to="/organiser/events/new">
          <Button><Plus className="h-4 w-4" /> New event</Button>
        </Link>
      </div>

      <div className="mt-8 space-y-3">
        {events === null ? (
          <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
        ) : events.length === 0 ? (
          <EmptyState
            title="No events yet"
            description="Create your first draft — you can save it and come back before submitting for review."
            actionLabel="Create an event"
            onAction={() => (window.location.href = "/organiser/events/new")}
          />
        ) : (
          events.map((event) => (
            <Card key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[event.status]}>{event.status.replace("_", " ")}</Badge>
                  <span className="font-medium text-ink dark:text-ink-dark">{event.title}</span>
                </div>
                <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">{formatEventDate(event.starts_at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/organiser/events/${event.id}`}>
                  <Button variant="outline" size="sm">Edit</Button>
                </Link>
                {(event.status === "published" || event.status === "paused") && (
                  <Link to={`/organiser/events/${event.id}/checkin`}>
                    <Button variant="outline" size="sm">Check-in</Button>
                  </Link>
                )}
                {event.status === "draft" && (
                  <Button size="sm" disabled={busyId === event.id} onClick={() => transition(event.id, "pending_review")}>
                    Submit for review
                  </Button>
                )}
                {event.status === "pending_review" && (
                  <Button variant="ghost" size="sm" disabled={busyId === event.id} onClick={() => transition(event.id, "draft")}>
                    Withdraw to draft
                  </Button>
                )}
                {event.status === "published" && (
                  <Button variant="outline" size="sm" disabled={busyId === event.id} onClick={() => transition(event.id, "paused")}>
                    Pause
                  </Button>
                )}
                {event.status === "paused" && (
                  <Button size="sm" disabled={busyId === event.id} onClick={() => transition(event.id, "published")}>
                    Resume
                  </Button>
                )}
                {(event.status === "published" || event.status === "paused") && (
                  <Button variant="ghost" size="sm" disabled={busyId === event.id} onClick={() => transition(event.id, "cancelled")}>
                    Cancel
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
