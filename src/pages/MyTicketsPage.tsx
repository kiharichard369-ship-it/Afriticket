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
import { downloadTicketsPng, toDownloadable } from "../lib/ticketFiles";
import { Download, Ticket as TicketIcon } from "lucide-react";

interface TicketWithEvent {
  id: string;
  public_code: string;
  backup_code: string;
  status: string;
  order_id: string;
  purchase: {
    buyer_email: string | null;
    buyer_phone: string | null;
    reference: string;
  } | null;
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
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const base = ticket.purchase?.reference ?? ticket.public_code.slice(0, 8);
      await downloadTicketsPng([toDownloadable(ticket)], `afriticket-${base}-${ticket.backup_code}`);
    } catch (error) {
      setDownloadError((error as Error).message || "Couldn't create the download. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex justify-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`QR code for ${ticket.event?.title ?? "your ticket"}`} className="h-32 w-32 rounded-lg border border-border-warm dark:border-border-dark" />
        ) : (
          <div className="h-32 w-32 animate-pulse rounded-lg bg-ink/10" aria-label="Generating ticket QR code" />
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
        <dl className="mt-3 grid gap-1 text-xs text-ink-soft dark:text-ink-soft-dark sm:grid-cols-2">
          <div>
            <dt className="font-medium text-ink-faint">Purchase email</dt>
            <dd className="break-all text-ink dark:text-ink-dark">{ticket.purchase?.buyer_email ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="font-medium text-ink-faint">Purchase phone</dt>
            <dd className="text-ink dark:text-ink-dark">{ticket.purchase?.buyer_phone ?? "Not provided"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-faint">
          Backup code (if the QR won't scan): <span className="font-mono font-semibold text-ink dark:text-ink-dark">{ticket.backup_code}</span>
        </p>
        {(ticket.status === "valid" || ticket.status === "used") && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled={downloading} onClick={download}>
              <Download aria-hidden="true" className="h-4 w-4" />
              {downloading ? "Preparing…" : "Download ticket"}
            </Button>
            {ticket.status === "valid" &&
              (refundState === "requested" ? (
                <p className="text-xs text-sage">Refund requested — the organiser will review it.</p>
              ) : (
                <Button variant="ghost" size="sm" disabled={refundState === "requesting"} onClick={requestRefund}>
                  {refundState === "requesting" ? "Requesting…" : "Request refund"}
                </Button>
              ))}
          </div>
        )}
        {downloadError && <p className="mt-1 text-xs text-rust">{downloadError}</p>}
        {refundState === "error" && <p className="mt-1 text-xs text-rust">{refundError}</p>}
      </div>
    </Card>
  );
}

export function MyTicketsPage() {
  const { user } = useAuth();
  // Guests who paid without an account hold an anonymous session; they must log in to see tickets here.
  const isGuest = !user || Boolean(user.is_anonymous);
  const [tickets, setTickets] = useState<TicketWithEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [recoveryState, setRecoveryState] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user || user.is_anonymous) return;
    const db = supabase as NonNullable<typeof supabase>;
    let cancelled = false;
    let loading = false;
    let claimErrorMessage: string | null = null;

    async function loadTickets() {
      if (loading) return;
      loading = true;
      try {
        // Attach paid guest purchases made with this account's CONFIRMED email.
        const { error: claimError } = await db.rpc("claim_guest_orders_by_email");
        claimErrorMessage = claimError ? `We couldn't link guest purchases to this account: ${claimError.message}` : null;

        const { data, error } = await db
          .from("tickets")
          .select("id, public_code, backup_code, status, order_id, purchase:orders!tickets_order_id_fkey(buyer_email, buyer_phone, reference), event:events(title, starts_at, slug, venue:venues(name, town))")
          .order("issued_at", { ascending: false });
        if (error) throw new Error(`We couldn't load your tickets: ${error.message}`);
        if (!cancelled) {
          setTickets((data as unknown as TicketWithEvent[]) ?? []);
          setLoadError(data && data.length > 0 ? null : claimErrorMessage);
        }
      } catch (error) {
        if (!cancelled) {
          setTickets([]);
          setLoadError((error as Error).message);
        }
      } finally {
        loading = false;
      }
    }

    void loadTickets();
    const refreshTimer = window.setInterval(() => void loadTickets(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [user]);

  async function recoverPayment() {
    if (!supabase || !paymentMessage.trim()) return;
    setRecoveryState("checking");
    setRecoveryMessage(null);
    const { data, error } = await supabase.functions.invoke("recover-payment", {
      body: { message: paymentMessage },
    });
    if (error || data?.error) {
      let message = data?.error ?? error?.message ?? "Payment could not be verified.";
      try {
        const body = await (error as { context?: Response } | null)?.context?.json();
        if (body?.error) message = String(body.error);
      } catch {
        /* keep the generic message */
      }
      setRecoveryState("error");
      setRecoveryMessage(message);
      return;
    }
    setRecoveryState("success");
    setRecoveryMessage(`${data.ticketsIssued ?? 0} ticket${data.ticketsIssued === 1 ? "" : "s"} issued. This page will update automatically.`);
    setPaymentMessage("");
  }

  if (isGuest) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink dark:text-ink-dark">My tickets</h1>
        <p className="mt-2 text-ink-soft dark:text-ink-soft-dark">Log in to see tickets you've bought.</p>
        <p className="mt-2 text-sm text-ink-soft dark:text-ink-soft-dark">
          Bought without an account? Log in or create an account using the same email you entered at checkout, and your tickets will appear here, ready to download.
        </p>
        <Link to="/login" state={{ from: "/my-tickets" }}>
          <Button className="mt-6">Log in or sign up</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink dark:text-ink-dark">My tickets</h1>

      <Card className="mt-6 border-saffron/30 bg-saffron/5 p-5 dark:bg-saffron/10">
        <h2 className="font-display text-lg font-semibold text-ink dark:text-ink-dark">Recover a paid ticket</h2>
        <p className="mt-1 text-sm text-ink-soft dark:text-ink-soft-dark">
          If M-Pesa accepted your payment but no ticket appeared, paste the complete Safaricom confirmation message here. We verify it against your Afriticket payment and your signed-in account before issuing anything.
        </p>
        <textarea
          value={paymentMessage}
          onChange={(event) => setPaymentMessage(event.target.value)}
          rows={4}
          placeholder="Paste the Safaricom M-Pesa confirmation SMS…"
          className="mt-4 w-full rounded-lg border border-border-warm bg-paper p-3 text-sm text-ink outline-none ring-saffron focus:ring-2 dark:border-border-dark dark:bg-paper-dark dark:text-ink-dark"
        />
        <Button className="mt-3" disabled={!paymentMessage.trim() || recoveryState === "checking"} onClick={recoverPayment}>
          {recoveryState === "checking" ? "Verifying payment…" : "Verify and issue ticket"}
        </Button>
        {recoveryMessage && <p className={`mt-3 text-sm ${recoveryState === "error" ? "text-rust" : "text-sage"}`} role="status">{recoveryMessage}</p>}
      </Card>

      <div className="mt-6 space-y-4">
        {tickets === null ? (
          <p className="text-ink-soft dark:text-ink-soft-dark">Loading…</p>
        ) : loadError ? (
          <Card className="border-rust/40 p-5" role="alert">
            <h2 className="font-semibold text-ink dark:text-ink-dark">We couldn't load your tickets</h2>
            <p className="mt-1 text-sm text-rust">{loadError}</p>
            <p className="mt-2 text-xs text-ink-soft dark:text-ink-soft-dark">Your payment may still be safe. Please refresh shortly or contact support with your payment confirmation.</p>
          </Card>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={<TicketIcon className="h-8 w-8 text-ink-faint" />}
            title="No tickets yet"
            description="Once you buy a ticket, it'll show up here with a QR code for entry. If you have already paid, refresh shortly while payment confirmation completes."
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