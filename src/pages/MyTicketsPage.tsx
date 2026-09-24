import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { formatEventDate, formatEventTime } from "../lib/date";
import { Ticket as TicketIcon } from "lucide-react";

interface TicketWithEvent {
  id: string;
  public_code: string;
  backup_code: string;
  status: string;
  order_id: string;
  event: { title: string; starts_at: string; slug: string; venue?: { name: string; town: string } } | null;
}

const STATUS_TONE: Record<string, "saffron" | "sage" | "rust" | "neutral"> = {
  valid: "sage",
  used: "neutral",
  cancelled: "rust",
  refunded: "rust",
  expired: "rust",
};

function TicketCard({ ticket }: { ticket: TicketWithEvent }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [refundState, setRefundState] = useState<"idle" | "requesting" | "requested" | "error">("idle");
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(ticket.public_code, { margin: 1, width: 180 }).then(setQrDataUrl);
  }, [ticket.public_code]);

  async function requestRefund() {
    if (!supabase) return;
    const reason = window.prompt("Why are you requesting a refund?");
    if (!reason) return;
    setRefundState("requesting");
    const { error } = await supabase.rpc("request_refund", { p_order_id: ticket.order_id, p_reason: reason });
    if (error) {
      setRefundError(error.message);
      setRefundState("error");
    } else {
      setRefundState("requested");
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex justify-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Ticket QR code" className="h-32 w-32 rounded-lg border border-border-warm dark:border-border-dark" />
        ) : (
          <div className="h-32 w-32 animate-pulse rounded-lg bg-ink/10" />
        )}
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[ticket.status] ?? "neutral"}>{ticket.status}</Badge>
        </div>
        <h3 className="mt-1 font-display text-lg font-semibold text-ink dark:text-ink-dark">
          {ticket.event?.title ?? "Event"}
        </h3>
        {ticket.event && (
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
            {formatEventDate(ticket.event.starts_at)} · {formatEventTime(ticket.event.starts_at)}
            {ticket.event.venue && ` · ${ticket.event.venue.name}, ${ticket.event.venue.town}`}
          </p>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          Backup code (if the QR won't scan): <span className="font-mono font-semibold text-ink dark:text-ink-dark">{ticket.backup_code}</span>
        </p>
        {ticket.status === "valid" && (
          <div className="mt-3">
            {refundState === "requested" ? (
              <p className="text-xs text-sage">Refund requested — the organiser will review it.</p>
            ) : (
              <Button variant="ghost" size="sm" disabled={refundState === "requesting"} onClick={requestRefund}>
                {refundState === "requesting" ? "Requesting…" : "Request refund"}
              </Button>
            )}
            {refundState === "error" && <p className="mt-1 text-xs text-rust">{refundError}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

export function MyTicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketWithEvent[] | null>(null);

  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("tickets")
      .select("id, public_code, backup_code, status, order_id, event:events(title, starts_at, slug, venue:venues(name, town))")
      .order("issued_at", { ascending: false })
      .then(({ data }) => setTickets((data as unknown as TicketWithEvent[]) ?? []));
  }, [user]);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">My tickets</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">Log in to see tickets you've bought.</p>
        <Link to="/login" state={{ from: "/my-tickets" }}>
          <Button className="mt-6">Log in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">My tickets</h1>

      <div className="mt-6 space-y-4">
        {tickets === null ? (
          <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<TicketIcon className="h-8 w-8 text-ink-faint" />}
            title="No tickets yet"
            description="Once you buy a ticket, it'll show up here with a QR code for entry."
            actionLabel="Browse events"
            onAction={() => (window.location.href = "/")}
          />
        ) : (
          tickets.map((t) => <TicketCard key={t.id} ticket={t} />)
        )}
      </div>
    </div>
  );
}
