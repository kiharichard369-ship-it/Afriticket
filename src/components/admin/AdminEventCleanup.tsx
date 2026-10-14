// Save as: src/components/admin/AdminEventCleanup.tsx
//
// Admin tool: finds events that ended a while ago, notifies their organisers, waits
// 24 hours (so they can download their data or appeal), then removes them.
//   * events that never sold anything are deleted for good
//   * events with orders or tickets are archived and their financial records kept
// A background job removes due events every hour; the button runs it on demand.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { formatEventDate, formatEventTime } from "../../lib/date";
import { formatKes } from "../../lib/currency";

interface Candidate {
  event_id: string;
  title: string;
  organisation_name: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  orders_count: number;
  tickets_count: number;
  gross_minor: number;
  will_delete: boolean;
  total_count: number | string;
}

interface Scheduled {
  event_id: string;
  title: string;
  organisation_name: string;
  cleanup_status: string;
  due_at: string;
  appeal_reason: string | null;
  will_delete: boolean;
}

export function AdminEventCleanup() {
  const [days, setDays] = useState("30");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [candidateResult, scheduledResult] = await Promise.all([
      supabase.rpc("list_cleanup_candidates", { p_days: Number(days), p_limit: 100, p_offset: 0 }),
      supabase.rpc("list_event_cleanups"),
    ]);
    setLoading(false);
    const failure = candidateResult.error ?? scheduledResult.error;
    if (failure) {
      setError(failure.message);
      return;
    }
    setError(null);
    const list = (candidateResult.data ?? []) as Candidate[];
    setCandidates(list);
    setTotal(Number(list[0]?.total_count ?? 0));
    setSelected(new Set());
    setScheduled((scheduledResult.data ?? []) as Scheduled[]);
  }, [days]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // An appeal arrives while this page is open.
  useEffect(() => {
    const refresh = () => void loadAll();
    window.addEventListener("afriticket:staff-notification", refresh);
    return () => window.removeEventListener("afriticket:staff-notification", refresh);
  }, [loadAll]);

  async function run(action: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>, success: (data: unknown) => string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: rpcError, data } = await action();
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNotice(success(data));
    await loadAll();
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => (current.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.event_id))));
  }

  async function schedule() {
    if (!supabase || selected.size === 0) return;
    const ids = [...selected];
    if (!window.confirm(`Notify the organisers and schedule ${ids.length} event${ids.length === 1 ? "" : "s"} for removal in 24 hours?`)) return;
    await run(
      () => supabase!.rpc("schedule_event_cleanup", { p_event_ids: ids, p_days: Number(days) }),
      (data) => `${Number(data ?? 0)} event${Number(data) === 1 ? "" : "s"} scheduled. Organisers have been notified.`,
    );
  }

  async function decide(row: Scheduled, keep: boolean) {
    if (!supabase) return;
    const note = window.prompt(keep ? "Note for the organiser (optional):" : "Why is the appeal not accepted? (optional note for the organiser):");
    if (note === null) return;
    await run(
      () => supabase!.rpc("decide_event_cleanup", { p_event_id: row.event_id, p_keep: keep, p_note: note || null }),
      () => (keep ? `${row.title} will be kept.` : `Appeal rejected. ${row.title} will be removed in 24 hours.`),
    );
  }

  async function cancel(row: Scheduled) {
    if (!supabase || !window.confirm(`Call off the removal of "${row.title}"? The organiser will be told.`)) return;
    await run(() => supabase!.rpc("cancel_event_cleanup", { p_event_id: row.event_id }), () => `Removal of ${row.title} called off.`);
  }

  async function removeDueNow() {
    if (!supabase || !window.confirm("Remove every event whose 24 hours are up now?")) return;
    await run(
      () => supabase!.rpc("run_event_cleanup"),
      (data) => {
        const row = (Array.isArray(data) ? data[0] : data) as { deleted_count?: number; archived_count?: number } | undefined;
        return `Done. Deleted ${row?.deleted_count ?? 0}, archived ${row?.archived_count ?? 0}.`;
      },
    );
  }

  const now = Date.now();

  return (
    <section id="event-cleanup" className="mt-10 scroll-mt-6">
      <h2 className="font-display text-xl text-ink dark:text-ink-dark">Event clean-up</h2>
      <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
        Old events are listed oldest first. Scheduling one tells its organisers right away and gives them 24 hours to download their data or appeal.
        Events that never sold anything are then deleted; events with sales are archived so the money records are kept.
      </p>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="cleanup-days" className="mb-1 block text-xs font-medium text-ink-soft dark:text-ink-soft-dark">Ended more than</label>
            <Select id="cleanup-days" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="30">30 days ago</option>
              <option value="60">60 days ago</option>
              <option value="90">90 days ago</option>
              <option value="180">180 days ago</option>
            </Select>
          </div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadAll()}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={removeDueNow}>Remove due events now</Button>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-sage">{notice}</p>}

        <h3 className="mt-5 font-medium text-ink dark:text-ink-dark">Old events ({total})</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border-warm text-xs uppercase text-ink-faint dark:border-border-dark">
              <tr>
                <th className="py-2 pr-2"><input type="checkbox" aria-label="Select all" checked={candidates.length > 0 && selected.size === candidates.length} onChange={toggleAll} className="h-4 w-4 accent-saffron" /></th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Ended</th>
                <th className="px-2 py-2">Sales</th>
                <th className="px-2 py-2">What happens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-warm dark:divide-border-dark">
              {candidates.map((row) => (
                <tr key={row.event_id} className="align-top text-ink dark:text-ink-dark">
                  <td className="py-2 pr-2"><input type="checkbox" aria-label={`Select ${row.title}`} checked={selected.has(row.event_id)} onChange={() => toggle(row.event_id)} className="h-4 w-4 accent-saffron" /></td>
                  <td className="px-2 py-2">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-ink-soft dark:text-ink-soft-dark">{row.organisation_name} · {row.status.replace("_", " ")}</p>
                  </td>
                  <td className="px-2 py-2 text-xs text-ink-soft dark:text-ink-soft-dark">{formatEventDate(row.ends_at ?? row.starts_at)}</td>
                  <td className="px-2 py-2 text-xs">{row.orders_count} orders · {row.tickets_count} tickets{row.gross_minor > 0 && ` · ${formatKes(row.gross_minor)}`}</td>
                  <td className="px-2 py-2"><Badge tone={row.will_delete ? "rust" : "neutral"}>{row.will_delete ? "Deleted" : "Archived"}</Badge></td>
                </tr>
              ))}
              {!loading && candidates.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-ink-soft dark:text-ink-soft-dark">No events are old enough to clear.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > candidates.length && <p className="mt-2 text-xs text-ink-faint">Showing the {candidates.length} oldest of {total}. Schedule these, then refresh for the next batch.</p>}
        <Button className="mt-3" disabled={busy || selected.size === 0} onClick={schedule}>
          Notify organisers and schedule {selected.size > 0 ? selected.size : ""} for removal
        </Button>
      </Card>

      <Card className="mt-4 p-4">
        <h3 className="font-medium text-ink dark:text-ink-dark">Scheduled for removal ({scheduled.length})</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border-warm text-xs uppercase text-ink-faint dark:border-border-dark">
              <tr>
                <th className="py-2 pr-2">Event</th>
                <th className="px-2 py-2">Removal due</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-warm dark:divide-border-dark">
              {scheduled.map((row) => {
                const due = new Date(row.due_at).getTime() <= now;
                return (
                  <tr key={row.event_id} className="align-top text-ink dark:text-ink-dark">
                    <td className="py-2 pr-2">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-ink-soft dark:text-ink-soft-dark">{row.organisation_name} · {row.will_delete ? "will be deleted" : "will be archived"}</p>
                    </td>
                    <td className="px-2 py-2 text-xs text-ink-soft dark:text-ink-soft-dark">
                      {formatEventDate(row.due_at)} {formatEventTime(row.due_at)}
                      {due && row.cleanup_status === "scheduled" && <span className="block text-rust">Due now</span>}
                    </td>
                    <td className="px-2 py-2">
                      {row.cleanup_status === "appealed" ? (
                        <>
                          <Badge tone="rust">Appeal received</Badge>
                          {row.appeal_reason && <p className="mt-1 max-w-xs whitespace-pre-line text-xs text-ink-soft dark:text-ink-soft-dark">{row.appeal_reason}</p>}
                        </>
                      ) : (
                        <Badge tone="saffron">Waiting out 24 hours</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.cleanup_status === "appealed" ? (
                          <>
                            <Button size="sm" disabled={busy} onClick={() => decide(row, true)}>Keep event</Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(row, false)}>Reject appeal</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => cancel(row)}>Call off</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {scheduled.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-ink-soft dark:text-ink-soft-dark">Nothing is scheduled for removal.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}