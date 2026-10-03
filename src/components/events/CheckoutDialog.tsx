import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import type { EventDetail } from "../../types/event";
import { formatKes } from "../../lib/currency";
import { downloadTicketsPng, fetchTicketsForOrder, type DownloadableTicket } from "../../lib/ticketFiles";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

const M_PESA_COUNTRIES = [
  { code: "KE", name: "Kenya", dialCode: "254" },
  { code: "TZ", name: "Tanzania", dialCode: "255" },
  { code: "MZ", name: "Mozambique", dialCode: "258" },
  { code: "CD", name: "DR Congo", dialCode: "243" },
  { code: "LS", name: "Lesotho", dialCode: "266" },
  { code: "ET", name: "Ethiopia", dialCode: "251" },
] as const;

function normalizeLocalPhone(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** supabase-js hides the server's message behind a generic error; read it from the response. */
async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const body = await (error as { context?: Response }).context?.json();
    if (body?.error) return String(body.error);
  } catch {
    /* keep the fallback */
  }
  return fallback;
}

/** Pre-selects one ticket of the first type that is still in stock. */
function defaultQuantities(event: EventDetail): Record<string, number> {
  const first = event.ticketTypes.find((t) => t.remaining > 0 && t.perOrderLimit >= 1);
  return first ? { [first.id]: 1 } : {};
}

type Step = "select" | "phone" | "processing" | "success" | "failed" | "pending" | "error";

export function CheckoutDialog({ event, open, onOpenChange }: { event: EventDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const [quantities, setQuantities] = useState<Record<string, number>>(() => defaultQuantities(event));
  const [sessionKey, setSessionKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<Step>("select");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("KE");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ticketsIssued, setTicketsIssued] = useState(0);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [paymentPollMessage, setPaymentPollMessage] = useState("Waiting for Safaricom to confirm your payment…");
  const [downloadable, setDownloadable] = useState<DownloadableTicket[]>([]);
  const autoDownloadStarted = useRef(false);

  // Guests get an anonymous session when they pay; they only count as "logged in" with a real account.
  const isGuest = !user || Boolean(user.is_anonymous);

  const totalMinor = event.ticketTypes.reduce((sum, t) => sum + t.priceMinor * (quantities[t.id] ?? 0), 0);
  const totalQty = Object.values(quantities).reduce((a, b) => a + b, 0);
  const selectedTypes = event.ticketTypes.filter((t) => (quantities[t.id] ?? 0) > 0);
  const selectedPhoneCountry = M_PESA_COUNTRIES.find((country) => country.code === phoneCountry) ?? M_PESA_COUNTRIES[0];
  const localPhone = normalizeLocalPhone(phone);
  const internationalPhone = `${selectedPhoneCountry.dialCode}${localPhone}`;
  const emailOk = EMAIL_PATTERN.test(email.trim());

  // Start every time the dialog opens with 1 ticket already selected.
  useEffect(() => {
    if (open) setQuantities(defaultQuantities(event));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event.id]);

  function reset() {
    setStep("select");
    setError(null);
    setQuantities(defaultQuantities(event));
    setSessionKey(crypto.randomUUID());
    setPaymentOrderId(null);
    setPaymentPollMessage("Waiting for Safaricom to confirm your payment…");
    setDownloadable([]);
    autoDownloadStarted.current = false;
  }

  function close() {
    onOpenChange(false);
    // Give the close animation a moment before resetting the visible state.
    setTimeout(reset, 200);
  }

  function goToPhoneStep() {
    if (!isSupabaseConfigured) {
      // Phase 1/2 behaviour preserved: preview-only when there's no backend yet.
      close();
      return;
    }
    setError(null);
    setStep("phone");
  }

  // Fetches the freshly issued tickets and saves them to the device, once per checkout.
  const deliverTickets = useCallback(async (orderId: string) => {
    if (!supabase || autoDownloadStarted.current) return;
    autoDownloadStarted.current = true;
    try {
      const tickets = await fetchTicketsForOrder(supabase, orderId);
      setDownloadable(tickets);
      if (tickets.length > 0) {
        await downloadTicketsPng(tickets, `afriticket-${tickets[0].orderReference || orderId.slice(0, 8)}`);
      }
    } catch {
      // Browsers can block automatic downloads; the visible Download button covers that.
    }
  }, []);

  async function submitCheckout() {
    if (!supabase || selectedTypes.length === 0) return;
    if (localPhone.length < 7 || localPhone.length > 12) {
      setError("Enter a valid local phone number using digits only.");
      return;
    }
    if (!emailOk) {
      setError("Enter a valid email address. It's how you can get your tickets again later.");
      return;
    }
    const db = supabase;
    setStep("processing");
    setError(null);

    try {
      // No account needed: start a guest (anonymous) session if nobody is signed in.
      const { data: sessionData } = await db.auth.getSession();
      if (!sessionData.session) {
        const { error: anonError } = await db.auth.signInAnonymously();
        if (anonError) {
          throw new Error(`We couldn't start guest checkout (${anonError.message}). Please try again or log in.`);
        }
      }

      // Only opaque ticket IDs and quantities leave the browser. The database
      // function locks inventory rows and computes the actual holds.
      const { data: holds, error: holdError } = await db.rpc("create_ticket_holds", {
        p_event_id: event.id,
        p_items: selectedTypes.map((ticketType) => ({
          ticket_type_id: ticketType.id,
          quantity: quantities[ticketType.id] ?? 0,
        })),
        p_session_key: sessionKey,
      });
      if (holdError) throw new Error(holdError.message.replace(/^sold_out: /, ""));

      const holdRows = (holds ?? []) as Array<{ id: string }>;
      if (holdRows.length !== selectedTypes.length || holdRows.some((hold) => !hold.id)) {
        throw new Error("The server did not create all checkout holds. Please try again.");
      }
      const holdIds = holdRows.map((hold) => hold.id);

      const { data: order, error: orderError } = await db.rpc("create_pending_order_multi", {
        p_hold_ids: holdIds,
        p_session_key: sessionKey,
        p_buyer_email: email.trim() || null,
        p_buyer_phone: internationalPhone || null,
        p_idempotency_key: crypto.randomUUID(),
      }).single();
      if (orderError) {
        // Keep hold release authoritative: the existing server-side expiry
        // sweep/just-in-time expiry handles failed order creation, while
        // payment failures are released by fail_payment on the server.
        throw new Error(orderError.message);
      }
      const orderId = (order as { id: string }).id;

      const { data: initiation, error: fnError } = await db.functions.invoke("initiate-payment", {
        // The Edge Function reads order.total_minor from the database. Do not
        // send the client-estimated total or line prices to the payment path.
        body: { orderId, phoneNumber: internationalPhone },
      });
      if (fnError) {
        throw new Error(await functionErrorMessage(fnError, "Payment could not be started. Please try again."));
      }

      if (initiation.status === "succeeded") {
        setTicketsIssued(initiation.ticketsIssued ?? totalQty);
        setStep("success");
        void deliverTickets(orderId);
      } else if (initiation.status === "pending") {
        setPaymentOrderId(orderId);
        setPaymentPollMessage("Waiting for Safaricom to confirm your payment…");
        setStep("pending");
      } else {
        setError("Payment didn't go through. You can try again.");
        setStep("failed");
      }
    } catch (err) {
      setError((err as Error).message);
      setStep("error");
    }
  }

  useEffect(() => {
    if (step !== "pending" || !paymentOrderId || !supabase) return;
    const db = supabase;
    const orderId = paymentOrderId;
    let cancelled = false;
    let ticks = 0;
    let checking = false;
    let verifying = false;

    // Cheap: reads our own database, which the webhook or check-payment updates.
    async function checkPayment() {
      if (checking) return;
      checking = true;
      try {
        const [{ data: order }, { data: payment }] = await Promise.all([
          db.from("orders").select("status").eq("id", orderId).maybeSingle(),
          db.from("payments").select("status").eq("order_id", orderId).order("initiated_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (cancelled) return;

        if (order?.status === "paid" || payment?.status === "succeeded") {
          const { data: issuedTickets } = await db.from("tickets").select("id").eq("order_id", orderId);
          if (cancelled) return;
          if (issuedTickets && issuedTickets.length > 0) {
            setTicketsIssued(issuedTickets.length);
            setPaymentPollMessage("Payment confirmed and tickets issued.");
            setStep("success");
            void deliverTickets(orderId);
            return;
          }
        }

        if (order?.status === "failed" || payment?.status === "failed") {
          setError("Safaricom reported that the payment was not completed. You can try again.");
          setStep("failed");
          return;
        }

        setPaymentPollMessage(
          ticks >= 60
            ? "Payment is still being confirmed. Your tickets will be emailed once it's confirmed, and you can get them by logging in with the same email."
            : "Payment request received. Keep this window open while Safaricom confirms it…",
        );
      } finally {
        checking = false;
      }
    }

    // Asks Safaricom directly, so we don't have to wait for their callback.
    async function verifyWithSafaricom() {
      if (verifying) return;
      verifying = true;
      try {
        const { data } = await db.functions.invoke("check-payment", { body: { orderId } });
        if (cancelled) return;
        if (data?.status === "succeeded" || data?.status === "failed") await checkPayment();
      } catch {
        // Temporary problem: the next tick tries again.
      } finally {
        verifying = false;
      }
    }

    async function tick() {
      ticks += 1;
      await checkPayment();
      if (cancelled) return;
      // Every 4s from second 6 to second 90, then every 16s (Daraja rate-limits queries).
      const early = ticks >= 3 && ticks <= 45 && ticks % 2 === 0;
      const late = ticks > 45 && ticks % 8 === 0;
      if (early || late) void verifyWithSafaricom();
    }

    void checkPayment();
    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [step, paymentOrderId, deliverTickets]);

  const selectedTypeNames = selectedTypes.map((ticketType) => ticketType.name).join(", ");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={
        step === "select" ? "Choose your tickets"
        : step === "phone" ? "Pay with M-Pesa"
        : step === "success" ? "You're going! 🎉"
        : step === "pending" ? "Check your phone"
        : "Checkout"
      }
      description={
        step === "select" && !isSupabaseConfigured
          ? "Preview only — this build isn't connected to real inventory or payment yet."
          : undefined
      }
    >
      {step === "select" && (
        <div className="space-y-4">
          {event.ticketTypes.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-warm p-3 dark:border-border-dark">
              <div>
                <p className="font-medium text-ink dark:text-ink-dark">{t.name}</p>
                <p className="text-sm text-ink-soft dark:text-ink-soft-dark">{t.remaining > 0 ? formatKes(t.priceMinor) : "Sold out"}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label={`Fewer ${t.name}`}
                  disabled={t.remaining === 0}
                  onClick={() => setQuantities((q) => ({ ...q, [t.id]: Math.max(0, (q[t.id] ?? 0) - 1) }))}
                  className="h-8 w-8 rounded-md border border-border-warm text-ink disabled:opacity-40 dark:border-border-dark dark:text-ink-dark"
                >
                  −
                </button>
                <span className="w-6 text-center text-ink dark:text-ink-dark">{quantities[t.id] ?? 0}</span>
                <button
                  aria-label={`More ${t.name}`}
                  disabled={t.remaining === 0 || (quantities[t.id] ?? 0) >= Math.min(t.perOrderLimit, t.remaining)}
                  onClick={() => setQuantities((q) => ({ ...q, [t.id]: (q[t.id] ?? 0) + 1 }))}
                  className="h-8 w-8 rounded-md border border-border-warm text-ink disabled:opacity-40 dark:border-border-dark dark:text-ink-dark"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border-warm pt-3 text-ink dark:border-border-dark dark:text-ink-dark">
            <span className="font-medium">Estimated total</span>
            <span className="font-semibold">{formatKes(totalMinor)}</span>
          </div>

          {error && <p role="alert" className="text-sm text-rust">{error}</p>}

          {isGuest && isSupabaseConfigured && (
            <p className="text-center text-xs text-ink-soft dark:text-ink-soft-dark">
              No account needed. Your tickets download as soon as you pay.{" "}
              <Link to="/login" state={{ from: window.location.pathname }} className="underline">Log in</Link> if you'd rather keep them in your account.
            </p>
          )}

          <Button className="w-full" disabled={totalQty === 0} onClick={goToPhoneStep}>
            {isSupabaseConfigured ? "Continue" : "Continue to checkout"}
          </Button>
          {!isSupabaseConfigured && (
            <p className="text-center text-xs text-ink-faint">
              Server-verified pricing, holds, and M-Pesa checkout are live once Supabase is connected.
            </p>
          )}
        </div>
      )}

      {step === "phone" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
            {formatKes(totalMinor)} estimated for {totalQty} ticket{totalQty === 1 ? "" : "s"}: {selectedTypeNames}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">M-Pesa phone number</label>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
              <Select aria-label="M-Pesa country" value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)}>
                {M_PESA_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>{country.name} (+{country.dialCode})</option>
                ))}
              </Select>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="712345678"
                value={phone}
                onChange={(e) => setPhone(normalizeLocalPhone(e.target.value))}
              />
            </div>
            <p className="mt-1 text-xs text-ink-faint">Enter the local number only, without the leading 0. Payment number: +{internationalPhone}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Email (for your ticket)</label>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {isGuest && (
              <p className="mt-1 text-xs text-ink-faint">
                Use an email you can access. You can log in with it later to download your tickets again.
              </p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-rust">{error}</p>}
          <Button className="w-full" disabled={localPhone.length < 7 || localPhone.length > 12 || !emailOk} onClick={submitCheckout}>
            Continue to payment
          </Button>
          <button onClick={() => setStep("select")} className="w-full text-center text-sm text-ink-soft hover:underline dark:text-ink-soft-dark">
            Back
          </button>
        </div>
      )}

      {step === "processing" && (
        <div className="py-8 text-center text-ink-soft dark:text-ink-soft-dark">
          <p>Reserving your tickets and starting payment…</p>
        </div>
      )}

      {step === "pending" && (
        <div className="space-y-4 py-4 text-center">
          <p className="text-ink dark:text-ink-dark">Your M-Pesa payment request was accepted for +{internationalPhone}.</p>
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark">Check that phone for the PIN prompt, enter your M-Pesa PIN, and keep this window open so your tickets can download automatically. {paymentPollMessage}</p>
          <Button variant="outline" onClick={close}>Close</Button>
        </div>
      )}

      {step === "success" && (
        <div className="space-y-4 py-4 text-center">
          <p className="text-ink dark:text-ink-dark">
            {ticketsIssued} ticket{ticketsIssued === 1 ? "" : "s"} issued. {downloadable.length > 0 ? "Your tickets are being saved to this device. " : ""}
            A confirmation email with your entry code{ticketsIssued === 1 ? "" : "s"} will be sent to {email}.
          </p>
          <Button
            className="w-full"
            disabled={downloadable.length === 0}
            onClick={() => void downloadTicketsPng(downloadable, `afriticket-${downloadable[0]?.orderReference || "tickets"}`)}
          >
            {downloadable.length === 0 ? "Preparing your tickets…" : "Download tickets"}
          </Button>
          <p className="text-xs text-ink-soft dark:text-ink-soft-dark">
            Keep this file: you can show it at the entrance, even offline. To get another copy later, log in or create an account with {email} and open My tickets.
          </p>
          <Link to="/my-tickets">
            <Button variant="outline" className="w-full">{isGuest ? "Go to My tickets" : "View my tickets"}</Button>
          </Link>
        </div>
      )}

      {(step === "failed" || step === "error") && (
        <div className="space-y-4 py-4 text-center">
          <p className="text-rust">{error ?? "Something went wrong."}</p>
          <Button variant="outline" onClick={() => { setSessionKey(crypto.randomUUID()); setStep("select"); }}>Try again</Button>
        </div>
      )}
    </Dialog>
  );
}