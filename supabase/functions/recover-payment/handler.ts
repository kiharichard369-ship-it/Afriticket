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

  const candidates = candidatesFromMessage(message);
  let payment: RecoveryPayment | null = null;
  for (const candidate of candidates) {
    payment = await deps.db.findByReference(candidate);
    if (payment) break;
  }
  if (!payment) {
    const amountMatch = message.match(/(?:KSH|KES)\s*([0-9][0-9,]*)/i) ?? message.match(/(?:paid|payment(?: of)?)\s*([0-9][0-9,]*)/i);
    const amountMinor = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) * 100 : NaN;
    const pending = await deps.db.listBuyerPending(deps.userId, deps.userEmail);
    const matching = pending.filter((candidate) => Number.isFinite(amountMinor) && candidate.amountMinor === amountMinor);
    if (matching.length === 1) payment = matching[0];
  }
  if (!payment) {
    return jsonResponse({ error: "no matching Afriticket payment reference was found; paste the full message including the amount or checkout reference" }, 404);
  }

  const emailMatches = Boolean(deps.userEmail && payment.buyerEmail && deps.userEmail.trim().toLowerCase() === payment.buyerEmail.trim().toLowerCase());
  if (payment.buyerId !== deps.userId && !emailMatches) {
    return jsonResponse({ error: "this payment does not belong to the signed-in buyer" }, 403);
  }
  if (payment.provider !== "mpesa") return jsonResponse({ error: "unsupported payment provider" }, 409);

  if (payment.paymentStatus !== "succeeded" || payment.orderStatus !== "paid") {
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
