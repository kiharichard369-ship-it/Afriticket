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

export function CheckoutDialog({ event, open, onOpenChange }: { event: EventDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
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
  }

  function close() {
    onOpenChange(false);
    // Give the close animation a moment before resetting the visible state.
    setTimeout(reset, 200);
  }

  function goToPhoneStep() {
    if (selectedTypes.length > 1) {
      setError("For now, checkout supports one ticket type per order — pick a single type, then check out again for another.");
      return;
    }
    if (!isSupabaseConfigured) {
      // Phase 1/2 behaviour preserved: preview-only when there's no backend yet.
      close();
      return;
    }
    setError(null);
    setStep("phone");
  }

  async function submitCheckout() {
    if (!supabase || selectedTypes.length !== 1) return;
    const ticketType = selectedTypes[0];
    const quantity = quantities[ticketType.id];
    setStep("processing");
    setError(null);

    try {
      const { data: hold, error: holdError } = await supabase
        .rpc("create_ticket_hold", {
          p_ticket_type_id: ticketType.id,
          p_quantity: quantity,
          p_session_key: crypto.randomUUID(),
        })
        .single();
      if (holdError) throw new Error(holdError.message.replace(/^sold_out: /, ""));

      const idempotencyKey = crypto.randomUUID();
      const { data: order, error: orderError } = await supabase
        .rpc("create_pending_order", {
          p_hold_id: (hold as { id: string }).id,
          p_buyer_email: email || null,
          p_buyer_phone: phone || null,
          p_idempotency_key: idempotencyKey,
        })
        .single();
      if (orderError) throw new Error(orderError.message);

      const { data: initiation, error: fnError } = await supabase.functions.invoke("initiate-payment", {
        body: { orderId: (order as { id: string }).id, phoneNumber: phone },
      });
      if (fnError) {
        throw new Error(
          "Checkout is set up in the database, but the initiate-payment Edge Function isn't deployed yet — see supabase/functions/README.md."
        );
      }

      if (initiation.status === "succeeded") {
        setTicketsIssued(initiation.ticketsIssued ?? quantity);
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
            {formatKes(totalMinor)} for {totalQty} × {selectedTypes[0]?.name}
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
            Pay {formatKes(totalMinor)}
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
          <Button variant="outline" onClick={() => setStep("select")}>Try again</Button>
        </div>
      )}
    </Dialog>
  );
}
