// Location: supabase/functions/event-partnership-mpesa-webhook/handler.ts
// Dedicated callback handler: partnership payments never enter ticket issuance.
import { jsonResponse } from "../_shared/cors.ts";
import type { EventPartnershipPaymentDb } from "../_shared/eventPartnershipPaymentDb.ts";
import type { PaymentAdapter } from "../_shared/paymentAdapter.ts";

export interface EventPartnershipWebhookDeps {
  db: EventPartnershipPaymentDb;
  adapter: PaymentAdapter;
}

const ACK = { ResultCode: 0, ResultDesc: "Accepted" };

export async function handleEventPartnershipMpesaWebhook(req: Request, deps: EventPartnershipWebhookDeps): Promise<Response> {
  const rawBody = await req.text();
  let verification;
  try {
    verification = await deps.adapter.verifyCallback(req, rawBody);
  } catch {
    return jsonResponse({ error: "malformed callback body" }, 400);
  }
  if (!verification.isAuthentic) return jsonResponse({ error: "unauthorized" }, 401);

  const isNewEvent = await deps.db.recordWebhookEventIfNew(verification.providerEventId, JSON.parse(rawBody));
  // Reprocess duplicates deliberately: a previous DB write can succeed while
  // its following confirmation RPC fails, and confirmation is idempotent.
  void isNewEvent;

  const payment = await deps.db.findPaymentByProviderReference(verification.providerReference);
  if (!payment) return jsonResponse(ACK, 200);
  if (verification.status === "failed") {
    await deps.db.failPayment(payment.id, verification.failureReason ?? "M-Pesa payment failed");
    return jsonResponse(ACK, 200);
  }

  const callbackData = verification.raw as { amount?: unknown; mpesaReceiptNumber?: unknown } | undefined;
  const amountKes = typeof callbackData?.amount === "number"
    ? callbackData.amount
    : typeof callbackData?.amount === "string" && callbackData.amount.trim()
      ? Number(callbackData.amount)
      : Number.NaN;
  const amountMinor = Number.isFinite(amountKes) && amountKes >= 0 ? Math.round(amountKes * 100) : undefined;
  // Daraja callbacks are not signed; the secret path is the authenticity
  // token. Requiring the provider amount to equal the immutable server price
  // adds an additional guard. The browser status endpoint can reconcile an
  // omitted amount by querying Daraja directly.
  if (amountMinor === undefined || amountMinor !== Number(payment.amount_minor)) {
    return jsonResponse(ACK, 200);
  }

  const receipt = typeof callbackData?.mpesaReceiptNumber === "string"
    ? callbackData.mpesaReceiptNumber.trim()
    : undefined;
  await deps.db.confirmPayment(payment.id, receipt, amountMinor);
  return jsonResponse(ACK, 200);
}
