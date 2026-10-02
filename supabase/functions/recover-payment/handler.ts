import { jsonResponse } from "../_shared/cors.ts";
import type { PaymentAdapter } from "../_shared/paymentAdapter.ts";

export interface RecoveryPayment {
  id: string;
  orderId: string;
  provider: string;
  providerReference: string;
  paymentStatus: string;
  orderStatus: string;
  amountMinor: number;
  buyerId: string | null;
  buyerEmail: string | null;
}

export interface RecoveryDb {
  findByReference(reference: string): Promise<RecoveryPayment | null>;
  listBuyerPending(userId: string, email?: string | null): Promise<RecoveryPayment[]>;
  confirmPayment(paymentId: string): Promise<{ orderId: string; ticketsIssued: number }>;
  failPayment(paymentId: string, reason: string): Promise<void>;
}

function candidatesFromMessage(message: string): string[] {
  const values = new Set<string>();
  for (const match of message.toUpperCase().matchAll(/[A-Z]{2,5}[-_]?[A-Z0-9]{4,20}|[A-Z0-9]{8,20}/g)) {
    const value = match[0].replace(/[.,;:!?)]$/, "");
    if (value.length >= 6 && value.length <= 24) values.add(value);
  }
  return [...values].slice(0, 20);
}

/**
 * Reads the amount PAID from a Safaricom SMS (the first "Ksh"/"KES" figure),
 * e.g. "Ksh1.00 paid to ..." -> 100 minor units. Handles decimals and commas.
 * The later "New M-PESA balance is Ksh240.88" figure is intentionally ignored.
 */
function amountMinorFromMessage(message: string): number {
  const match =
    message.match(/(?:KSH|KES)\.?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i) ??
    message.match(/(?:paid|payment(?: of)?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!match) return NaN;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

export async function handleRecoverPayment(
  req: Request,
  deps: { db: RecoveryDb; adapter: PaymentAdapter; userId: string; userEmail?: string | null },
): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  const message = body.message?.trim() ?? "";
  if (message.length < 6 || message.length > 2000) {
    return jsonResponse({ error: "paste the complete M-Pesa confirmation message" }, 400);
  }

  // Step 1: try to match by a reference/receipt found in the message.
  const candidates = candidatesFromMessage(message);
  let payment: RecoveryPayment | null = null;
  for (const candidate of candidates) {
    payment = await deps.db.findByReference(candidate);
    if (payment) break;
  }

  // True once Safaricom has already confirmed this exact payment during
  // candidate resolution, so we don't query it a second time below.
  let verifiedSucceeded = false;

  // Step 2: fall back to matching the buyer's open payments by amount.
  if (!payment) {
    const amountMinor = amountMinorFromMessage(message);
    const pending = await deps.db.listBuyerPending(deps.userId, deps.userEmail);
    const matching = pending.filter((candidate) => Number.isFinite(amountMinor) && candidate.amountMinor === amountMinor);

    if (matching.length === 1) {
      payment = matching[0];
    } else if (matching.length > 1) {
      // Several unpaid attempts share this amount (very common with Ksh 1
      // tests, or a customer retrying). Let Safaricom decide which succeeded.
      const paid: RecoveryPayment[] = [];
      for (const candidate of matching) {
        try {
          const result = await deps.adapter.query(candidate.providerReference);
          if (result.status === "succeeded") paid.push(candidate);
        } catch {
          // Safaricom can't answer for this one (too old, rate-limited, etc.): skip it.
        }
      }
      if (paid.length === 1) {
        payment = paid[0];
        verifiedSucceeded = true;
      } else if (paid.length > 1) {
        return jsonResponse(
          {
            error:
              "More than one of your payments for this amount was confirmed by Safaricom, so we can't tell which one this message belongs to. Paste the message again including your order reference (TY-…), or contact support with the M-Pesa receipt code.",
          },
          409,
        );
      } else {
        return jsonResponse(
          { error: "Safaricom has not confirmed any of your pending payments for this amount yet. Wait a minute and try again." },
          409,
        );
      }
    }
  }

  if (!payment) {
    return jsonResponse({ error: "no matching Afriticket payment reference was found; paste the full message including the amount or checkout reference" }, 404);
  }

  // Ownership check: the payment must belong to the signed-in buyer.
  const emailMatches = Boolean(deps.userEmail && payment.buyerEmail && deps.userEmail.trim().toLowerCase() === payment.buyerEmail.trim().toLowerCase());
  if (payment.buyerId !== deps.userId && !emailMatches) {
    return jsonResponse({ error: "this payment does not belong to the signed-in buyer" }, 403);
  }
  if (payment.provider !== "mpesa") return jsonResponse({ error: "unsupported payment provider" }, 409);

  // Step 3: never issue tickets on the strength of the pasted SMS alone;
  // always confirm with Safaricom (unless we just did in step 2).
  if (!verifiedSucceeded && (payment.paymentStatus !== "succeeded" || payment.orderStatus !== "paid")) {
    const result = await deps.adapter.query(payment.providerReference);
    if (result.status === "failed") {
      await deps.db.failPayment(payment.id, "payment query reported failure");
      return jsonResponse({ error: "Safaricom reports that this payment was not completed" }, 402);
    }
    if (result.status !== "succeeded") {
      return jsonResponse({ error: "Safaricom has not confirmed this payment yet" }, 409);
    }
  }

  const issued = await deps.db.confirmPayment(payment.id);
  return jsonResponse({ status: "succeeded", orderId: issued.orderId, ticketsIssued: issued.ticketsIssued });
}