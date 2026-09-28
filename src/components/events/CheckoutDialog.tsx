import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import type { EventDetail } from "../../types/event";
import { formatKes } from "../../lib/currency";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type Step = "select" | "phone" | "processing" | "success" | "failed" | "pending" | "error";

/**
 * Turns a supabase-js functions.invoke() error into something actionable.
 * The old handler collapsed every failure into "not deployed yet", which is
 * only one of several very different causes (not deployed, function crashed,
 * bad provider credentials, or the browser blocking the request via CORS).
 */
async function describeFunctionError(err: unknown): Promise<string> {
  const e = err as { name?: string; message?: string; context?: Response };

  if (e?.name === "FunctionsHttpError" && e.context) {
    const status = e.context.status;
    let detail = "";
    try {
      const body = await e.context.clone().json();
      detail = body?.error ?? body?.message ?? JSON.stringify(body);
    } catch {
      try {
        detail = await e.context.text();
      } catch {
        /* no readable body */
      }
    }
    if (status === 404) {
      return "The payment function (initiate-payment) was not found on your Supabase project. Deploy it with: supabase functions deploy initiate-payment";
    }
    return `Payment service returned an error (HTTP ${status})${detail ? `: ${detail}` : "."}`;
  }

  if (e?.name === "FunctionsFetchError") {
    return "Couldn't reach the payment function. Either it isn't deployed, or the browser blocked the request (CORS). If it is deployed, check that the ALLOWED_ORIGIN secret matches this site's address exactly (e.g. http://localhost:5173 while testing), or unset it.";
  }

  return e?.message ?? "Unknown payment error.";
}

export function CheckoutDialog({ event, open, onOpenChange }: { event: EventDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sessionKey, setSessionKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<Step>("select");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ticketsIssued, setTicketsIssued] = useState(0);

  const totalMinor = event.ticketTypes.reduce((sum, t) => sum + t.priceMinor * (quantities[t.id] ?? 0), 0);
  const totalQty = Object.values(quantities).reduce((a, b) => a + b, 0);
  const selectedTypes = event.ticketTypes.filter((t) => (quantities[t.id] ?? 0) > 0);

  function reset() {
    setStep("select");
    setError(null);
    setQuantities({});
    setSessionKey(crypto.randomUUID());
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

  async function submitCheckout() {
    if (!supabase || selectedTypes.length === 0) return;
    const db = supabase;
    setStep("processing");
    setError(null);

    try {
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
        p_buyer_email: email || null,
        p_buyer_phone: phone || null,
        p_idempotency_key: crypto.randomUUID(),
      }).single();
      if (orderError) {
        // Keep hold release authoritative: the existing server-side expiry
        // sweep/just-in-time expiry handles failed order creation, while
        // payment failures are released by fail_payment on the server.
        throw new Error(orderError.message);
      }

      const { data: initiation, error: fnError } = await db.functions.invoke("initiate-payment", {
        // The Edge Function reads order.total_minor from the database. Do not
        // send the client-estimated total or line prices to the payment path.
        body: { orderId: (order as { id: string }).id, phoneNumber: phone },
      });
      if (fnError) {
        throw new Error(await describeFunctionError(fnError));
      }

      if (initiation.status === "succeeded") {
        setTicketsIssued(initiation.ticketsIssued ?? totalQty);
        setStep("success");
      } else if (initiation.status === "pending") {
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
            <Input placeholder="2547XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink dark:text-ink-dark">Email (for your ticket)</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!phone || !email} onClick={submitCheckout}>
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
          <p className="text-ink dark:text-ink-dark">An M-Pesa prompt has been sent to {phone}. Enter your PIN to complete payment.</p>
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark">Once confirmed, your tickets will appear under "My tickets".</p>
          <Button variant="outline" onClick={close}>Close</Button>
        </div>
      )}

      {step === "success" && (
        <div className="space-y-4 py-4 text-center">
          <p className="text-ink dark:text-ink-dark">
            {ticketsIssued} ticket{ticketsIssued === 1 ? "" : "s"} issued and sent to {email}.
          </p>
          <Link to="/my-tickets">
            <Button className="w-full">View my tickets</Button>
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
