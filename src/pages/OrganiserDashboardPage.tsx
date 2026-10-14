import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useOrganisation } from "../hooks/useOrganisation";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { formatEventDate, formatEventTime } from "../lib/date";
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
  // Events the admins have scheduled for removal, keyed by event id.
  const [cleanups, setCleanups] = useState<Record<string, { status: string; due_at: string; appeal_reason: string | null; decision_note: string | null }>>({});

  async function refresh() {
    if (!supabase || !membership) return;
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("organisation_id", membership.organisation_id)
      .neq("status", "archived") // removed events no longer show here
      .order("created_at", { ascending: false });
    setEvents((data as EventRow[]) ?? []);

    const { data: cleanupRows } = await supabase.rpc("organisation_event_cleanups");
    const map: Record<string, { status: string; due_at: string; appeal_reason: string | null; decision_note: string | null }> = {};
    for (const row of (cleanupRows ?? []) as Array<{ event_id: string; status: string; due_at: string; appeal_reason: string | null; decision_note: string | null }>) {
      map[row.event_id] = row;
    }
    setCleanups(map);
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

  async function appealRemoval(eventId: string) {
    if (!supabase) return;
    const reason = window.prompt("Why should this event be kept? Please explain (at least 10 characters):");
    if (!reason) return;
    setBusyId(eventId);
    const { error } = await supabase.rpc("appeal_event_cleanup", { p_event_id: eventId, p_reason: reason });
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
                {(event.status === "published" || event.status === "paused" || event.status === "sold_out") && (
                  <Link to={`/organiser/events/${event.id}/checkin`}>
                    <Button variant="outline" size="sm">Check-in</Button>
                  </Link>
                )}
                {event.status !== "draft" && event.status !== "pending_review" && (
                  <Link to={`/organiser/events/${event.id}/attendees`}>
                    <Button variant="outline" size="sm">Attendees</Button>
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
              {cleanups[event.id] && (
                <div className="w-full rounded-lg border border-rust/30 bg-rust/5 p-3 text-sm text-ink dark:text-ink-dark">
                  {cleanups[event.id].status === "appealed" ? (
                    <p>Appeal received. Removal is on hold while an admin reviews it.</p>
                  ) : (
                    <>
                      <p>
                        This event is scheduled for removal on{" "}
                        <strong>{formatEventDate(cleanups[event.id].due_at)}, {formatEventTime(cleanups[event.id].due_at)}</strong>.
                        Download your attendee list and sales data before then (Attendees, then Export CSV), or appeal if this is a mistake.
                      </p>
                      {cleanups[event.id].decision_note && <p className="mt-1 text-xs text-ink-soft dark:text-ink-soft-dark">Note from Afriticket: {cleanups[event.id].decision_note}</p>}
                      <Button variant="outline" size="sm" className="mt-2" disabled={busyId === event.id} onClick={() => appealRemoval(event.id)}>
                        Appeal
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}