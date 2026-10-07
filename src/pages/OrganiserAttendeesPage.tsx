// Save as: src/pages/OrganiserAttendeesPage.tsx
// Route:   organiser/events/:eventId/attendees   (wrapped in RequireOrganiser)
//
// Shows who bought tickets for one event. What a person may see is decided by the
// database (owner/manager/finance see contact details; check-in staff see names only).
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { formatKes } from "../lib/currency";
import { formatEventDate, formatEventTime } from "../lib/date";

type Access = "full" | "limited" | "none";
type Tone = "saffron" | "sage" | "rust" | "neutral";

interface AttendeeRow {
  order_id: string;
  order_reference: string;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  order_status: string;
  tickets_count: number;
  tickets_checked_in: number;
  ticket_summary: string | null;
  total_minor: number | null;
  purchased_at: string;
  total_count: number | string;
}

interface Summary {
  orders_count: number;
  tickets_count: number;
  checked_in_count: number;
  gross_minor: number | null;
}

const PAGE_SIZE = 25;
const EXPORT_BATCH = 500;
const EXPORT_MAX_ROWS = 20_000;
const STATUS_TONE: Record<string, Tone> = { paid: "sage", refund_requested: "saffron", refunded: "rust" };
const STATUS_LABEL: Record<string, string> = { paid: "Paid", refund_requested: "Refund requested", refunded: "Refunded" };

// Quote the cell, and stop spreadsheets from running text that starts like a formula.
function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^\+?\d[\d\s-]*$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function OrganiserAttendeesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [access, setAccess] = useState<Access | undefined>(undefined);
  const [eventInfo, setEventInfo] = useState<{ title: string; starts_at: string } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // What may this person see for this event?
  useEffect(() => {
    if (!supabase || !eventId) return;
    let cancelled = false;
    (async () => {
      const [{ data: level }, { data: event }] = await Promise.all([
        supabase!.rpc("attendee_access_level", { p_event_id: eventId }),
        supabase!.from("events").select("title, starts_at").eq("id", eventId).maybeSingle(),
      ]);
      if (cancelled) return;
      setEventInfo((event as { title: string; starts_at: string } | null) ?? null);
      setAccess(level === "full" || level === "limited" ? level : "none");
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!supabase || !eventId || !access || access === "none") return;
    setLoading(true);
    const [listResult, summaryResult] = await Promise.all([
      supabase.rpc("list_event_attendees", {
        p_event_id: eventId,
        p_search: debouncedSearch || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      }),
      supabase.rpc("event_attendee_summary", { p_event_id: eventId }),
    ]);
    setLoading(false);
    if (listResult.error) {
      setError(listResult.error.message);
      return;
    }
    setError(null);
    const list = (listResult.data ?? []) as AttendeeRow[];
    setRows(list);
    setTotal(Number(list[0]?.total_count ?? 0));
    const summaryRow = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
    setSummary((summaryRow as Summary | undefined) ?? null);
  }, [eventId, access, debouncedSearch, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // New purchases appear without a reload (only while the tab is visible).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function exportCsv() {
    if (!supabase || !eventId) return;
    setExporting(true);
    setError(null);
    try {
      const all: AttendeeRow[] = [];
      for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_BATCH) {
        const { data, error: rpcError } = await supabase.rpc("list_event_attendees", {
          p_event_id: eventId,
          p_search: null,
          p_limit: EXPORT_BATCH,
          p_offset: offset,
        });
        if (rpcError) throw new Error(rpcError.message);
        const batch = (data ?? []) as AttendeeRow[];
        all.push(...batch);
        if (batch.length < EXPORT_BATCH) break;
      }

      // Exports of personal details are recorded; stop if that record can't be written.
      const { error: logError } = await supabase.rpc("log_attendee_export", { p_event_id: eventId, p_row_count: all.length });
      if (logError) throw new Error(logError.message);

      const header = ["Order", "Name", "Email", "Phone", "Tickets", "Ticket types", "Checked in", "Amount (KES)", "Status", "Purchased"];
      const lines = all.map((row) =>
        [
          row.order_reference,
          row.buyer_name,
          row.buyer_email,
          row.buyer_phone,
          row.tickets_count,
          row.ticket_summary,
          row.tickets_checked_in,
          row.total_minor === null ? "" : (row.total_minor / 100).toFixed(2),
          STATUS_LABEL[row.order_status] ?? row.order_status,
          new Date(row.purchased_at).toLocaleString("en-KE"),
        ].map(csvCell).join(","),
      );
      const csv = [header.map(csvCell).join(","), ...lines].join("\r\n");
      const blob = new Blob([`\ufeff${csv}\r\n`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = (eventInfo?.title ?? "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      anchor.href = url;
      anchor.download = `afriticket-attendees-${safeTitle}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (exportError) {
      setError(`Export failed: ${(exportError as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  if (access === undefined) {
    return <p className="mx-auto max-w-5xl px-6 py-10 text-ink-soft dark:text-ink-soft-dark">Loading…</p>;
  }
  if (access === "none") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">No access</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">
          You don't have permission to see who bought tickets for this event. Ask the organisation owner if you need it.
        </p>
        <Link to="/organiser/dashboard" className="mt-6 inline-block text-sm underline">Back to dashboard</Link>
      </div>
    );
  }

  const isFull = access === "full";
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/organiser/dashboard" className="text-sm text-ink-soft underline dark:text-ink-soft-dark">← Back to dashboard</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">Attendees</h1>
          {eventInfo && (
            <p className="mt-1 text-ink-soft dark:text-ink-soft-dark">
              {eventInfo.title} · {formatEventDate(eventInfo.starts_at)} · {formatEventTime(eventInfo.starts_at)}
            </p>
          )}
        </div>
        {isFull && (
          <Button variant="secondary" size="sm" disabled={exporting || total === 0} onClick={exportCsv}>
            <Download aria-hidden="true" className="h-4 w-4" />
            {exporting ? "Preparing…" : "Export CSV"}
          </Button>
        )}
      </div>

      {!isFull && (
        <p className="mt-3 rounded-lg border border-border-warm p-3 text-sm text-ink-soft dark:border-border-dark dark:text-ink-soft-dark">
          Your role shows names, tickets and check-in status. Contact details and amounts are hidden.
        </p>
      )}

      <div className={`mt-6 grid grid-cols-2 gap-3 ${isFull ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {[
          { label: "Orders", value: summary?.orders_count ?? "—" },
          { label: "Tickets sold", value: summary?.tickets_count ?? "—" },
          { label: "Checked in", value: summary ? `${summary.checked_in_count} / ${summary.tickets_count}` : "—" },
          ...(isFull ? [{ label: "Sales", value: summary?.gross_minor == null ? "—" : formatKes(summary.gross_minor) }] : []),
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{stat.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink dark:text-ink-dark">{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <Input
          aria-label="Search attendees"
          placeholder={isFull ? "Search by name, email, phone or order reference…" : "Search by name or order reference…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border-warm text-xs uppercase text-ink-faint dark:border-border-dark">
            <tr>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Tickets</th>
              <th className="px-4 py-3">Checked in</th>
              {isFull && <th className="px-4 py-3">Amount</th>}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Purchased</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-warm dark:divide-border-dark">
            {rows.map((row) => (
              <tr key={row.order_id} className="align-top text-ink dark:text-ink-dark">
                <td className="px-4 py-3">
                  <p className="font-medium">{row.buyer_name || (isFull ? row.buyer_email : null) || "Guest buyer"}</p>
                  {isFull && row.buyer_name && row.buyer_email && <p className="break-all text-xs text-ink-soft dark:text-ink-soft-dark">{row.buyer_email}</p>}
                  {isFull && row.buyer_phone && <p className="text-xs text-ink-faint">{row.buyer_phone}</p>}
                  <p className="text-xs text-ink-faint">Order {row.order_reference}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{row.tickets_count}</p>
                  {row.ticket_summary && <p className="text-xs text-ink-soft dark:text-ink-soft-dark">{row.ticket_summary}</p>}
                </td>
                <td className="px-4 py-3">{row.tickets_checked_in} / {row.tickets_count}</td>
                {isFull && <td className="px-4 py-3">{row.total_minor === null ? "—" : formatKes(row.total_minor)}</td>}
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[row.order_status] ?? "neutral"}>{STATUS_LABEL[row.order_status] ?? row.order_status}</Badge></td>
                <td className="px-4 py-3 text-xs text-ink-soft dark:text-ink-soft-dark">
                  {formatEventDate(row.purchased_at)}<br />{formatEventTime(row.purchased_at)}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={isFull ? 6 : 5} className="px-4 py-8 text-center text-ink-soft dark:text-ink-soft-dark">
                  {debouncedSearch ? "No attendees match that search." : "No tickets have been sold for this event yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-3 flex items-center justify-between text-sm text-ink-soft dark:text-ink-soft-dark">
        <span>{loading ? "Loading…" : `${total} order${total === 1 ? "" : "s"}`}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <span>Page {page + 1} of {lastPage + 1}</span>
          <Button variant="outline" size="sm" disabled={page >= lastPage || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        Buyers' details are personal data. Use them only to run this event, and don't share them or use them for unrelated marketing.
      </p>
    </div>
  );
}