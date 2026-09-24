import { jsonResponse } from "../_shared/cors.ts";
import type { DbClient } from "../_shared/dbClient.ts";
import type { PaymentAdapter } from "../_shared/paymentAdapter.ts";
import { noopLogger, type Logger } from "../_shared/logger.ts";

export interface WebhookDeps {
  db: DbClient;
  adapter: PaymentAdapter;
  logger?: Logger;
}

// Daraja expects a 200 with this exact shape regardless of outcome, or it
// will retry the callback — and we WANT it to retry on our own transient
// errors, just not re-process a callback we've already handled.
const ACK = { ResultCode: 0, ResultDesc: "Accepted" };

export async function handleMpesaWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const log = deps.logger ?? noopLogger;
  const rawBody = await req.text();

  let verification;
  try {
    verification = await deps.adapter.verifyCallback(req, rawBody);
  } catch {
    log.warn("malformed_callback_body");
    return jsonResponse({ error: "malformed callback body" }, 400);
  }

  if (!verification.isAuthentic) {
    // Deliberately vague: don't tell an attacker which part of the check failed.
    log.error("webhook_secret_mismatch");
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  log.info("webhook_received", { providerEventId: verification.providerEventId, providerReference: verification.providerReference, status: verification.status });

  const isNewEvent = await deps.db.recordWebhookEventIfNew("mpesa", verification.providerEventId, JSON.parse(rawBody));
  if (!isNewEvent) {
    log.info("webhook_duplicate_ignored", { providerEventId: verification.providerEventId });
    return jsonResponse(ACK, 200);
  }

  const payment = await deps.db.findPaymentByProviderReference("mpesa", verification.providerReference);
  if (!payment) {
    // We got a callback for a CheckoutRequestID we have no record of
    // initiating. Log-worthy, but still ack so Daraja doesn't retry forever.
    log.error("webhook_payment_not_found", { providerReference: verification.providerReference });
    return jsonResponse(ACK, 200);
  }

  if (verification.status === "succeeded") {
    await deps.db.confirmPayment(payment.id);
    log.info("webhook_payment_confirmed", { paymentId: payment.id, orderId: payment.order_id });
  } else {
    await deps.db.failPayment(payment.id, verification.failureReason ?? "payment failed");
    log.info("webhook_payment_failed", { paymentId: payment.id, orderId: payment.order_id, reason: verification.failureReason });
  }

  return jsonResponse(ACK, 200);
}
