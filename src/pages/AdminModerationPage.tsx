import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { formatEventDate } from "../lib/date";
import { formatKes } from "../lib/currency";
import type { EventRow, OrganiserApplicationRow } from "../types/database";

interface RefundRow {
  id: string;
  order_id: string;
  amount_minor: number;
  reason: string | null;
  order?: { reference: string } | null;
}

export function AdminModerationPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<OrganiserApplicationRow[] | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [refunds, setRefunds] = useState<RefundRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    if (!supabase) return;
    const [{ data: apps }, { data: evts }, { data: rfds }] = await Promise.all([
      supabase.from("organiser_applications").select("*").eq("status", "pending").order("created_at"),
      supabase.from("events").select("*, category:categories(*), venue:venues(*)").eq("status", "pending_review").order("created_at"),
      supabase.from("refunds").select("id, order_id, amount_minor, reason, order:orders(reference)").eq("status", "requested").order("created_at"),
    ]);
    setApplications((apps as OrganiserApplicationRow[]) ?? []);
    setEvents((evts as EventRow[]) ?? []);
    setRefunds((rfds as unknown as RefundRow[]) ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function approveApplication(id: string) {
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase.rpc("approve_organiser_application", { p_application_id: id, p_reason: null });
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  async function rejectApplication(id: string) {
    if (!supabase) return;
    const reason = window.prompt("Reason for rejecting this application?");
    if (reason === null) return;
    setBusyId(id);
    const { error } = await supabase.rpc("reject_organiser_application", { p_application_id: id, p_reason: reason });
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  async function decideEvent(id: string, status: "published" | "draft", reason?: string) {
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase
      .from("events")
      .update({ status, published_at: status === "published" ? new Date().toISOString() : null, moderation_reason: reason ?? null })
      .eq("id", id);
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  async function approveRefund(refundId: string) {
    if (!supabase || !user) return;
    setBusyId(refundId);
    const { error } = await supabase.rpc("approve_refund", { p_refund_id: refundId, p_approved_by: user.id });
    setBusyId(null);
    if (error) alert(error.message);
    else refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Moderation queue</h1>

      <section className="mt-8">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Organiser applications</h2>
        <div className="mt-3 space-y-3">
          {applications === null ? (
            <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
          ) : applications.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing pending.</p>
          ) : (
            applications.map((app) => (
              <Card key={app.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-ink dark:text-ink-dark">{app.organisation_name}</p>
                  <p className="text-sm text-ink-soft dark:text-ink-soft-dark">{app.contact_email}{app.notes ? ` — ${app.notes}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busyId === app.id} onClick={() => rejectApplication(app.id)}>Reject</Button>
                  <Button size="sm" disabled={busyId === app.id} onClick={() => approveApplication(app.id)}>Approve</Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Events awaiting review</h2>
        <div className="mt-3 space-y-3">
          {events === null ? (
            <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing pending.</p>
          ) : (
            events.map((event) => (
              <Card key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="saffron">{event.category?.name}</Badge>
                    <span className="font-medium text-ink dark:text-ink-dark">{event.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
                    {formatEventDate(event.starts_at)} · {event.venue?.name}, {event.venue?.town}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === event.id}
                    onClick={() => {
                      const reason = window.prompt("Reason for sending this back to draft?") ?? undefined;
                      decideEvent(event.id, "draft", reason);
                    }}
                  >
                    Send back
                  </Button>
                  <Button size="sm" disabled={busyId === event.id} onClick={() => decideEvent(event.id, "published")}>
                    Publish
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink dark:text-ink-dark">Refund requests</h2>
        <div className="mt-3 space-y-3">
          {refunds === null ? (
            <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
          ) : refunds.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing pending.</p>
          ) : (
            refunds.map((refund) => (
              <Card key={refund.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-ink dark:text-ink-dark">
                    {refund.order?.reference ?? refund.order_id} — {formatKes(refund.amount_minor)}
                  </p>
                  {refund.reason && <p className="text-sm text-ink-soft dark:text-ink-soft-dark">{refund.reason}</p>}
                </div>
                <Button size="sm" disabled={busyId === refund.id} onClick={() => approveRefund(refund.id)}>
                  Approve refund
                </Button>
              </Card>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
