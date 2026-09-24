import { jsonResponse } from "../_shared/cors.ts";
import type { DbClient } from "../_shared/dbClient.ts";
import type { PaymentAdapter } from "../_shared/paymentAdapter.ts";
import { noopLogger, type Logger } from "../_shared/logger.ts";

export interface InitiatePaymentDeps {
  db: DbClient;
  adapter: PaymentAdapter;
  logger?: Logger;
}

const PAYABLE_STATUSES = ["pending", "awaiting_payment", "failed"];

export async function handleInitiatePayment(req: Request, deps: InitiatePaymentDeps): Promise<Response> {
  const log = deps.logger ?? noopLogger;
  let body: { orderId?: string; phoneNumber?: string };
  try {
    body = await req.json();
  } catch {
    log.warn("invalid_json_body");
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }

  const { orderId, phoneNumber } = body;
  if (!orderId) return jsonResponse({ error: "orderId is required" }, 400);
  log.info("initiate_payment_requested", { orderId, provider: deps.adapter.name });

  const order = await deps.db.getOrder(orderId);
  if (!order) {
    log.warn("order_not_found", { orderId });
    return jsonResponse({ error: "order not found" }, 404);
  }
  if (!PAYABLE_STATUSES.includes(order.status)) {
    log.warn("order_not_payable", { orderId, status: order.status });
    return jsonResponse({ error: `order is not payable in status "${order.status}"` }, 409);
  }

  let initiateResult;
  try {
    initiateResult = await deps.adapter.initiate({
      orderId: order.id,
      orderReference: order.reference,
      amountMinor: order.total_minor,
      currency: "KES",
      phoneNumber,
    });
  } catch (err) {
    log.error("provider_initiate_failed", { orderId, error: (err as Error).message });
    return jsonResponse({ error: `payment provider rejected the request: ${(err as Error).message}` }, 502);
  }

  const payment = await deps.db.recordPaymentInitiation(order.id, deps.adapter.name, initiateResult.providerReference, order.total_minor);
  log.info("payment_recorded", { orderId, paymentId: payment.id, providerReference: initiateResult.providerReference });

  // The mock adapter has no webhook — it already knows the outcome, so
  // resolve the order right away instead of leaving it "awaiting_payment"
  // forever. A real async provider (M-Pesa) returns resolvedImmediately:
  // false here and its webhook finishes the job later.
  if (initiateResult.resolvedImmediately) {
    if (initiateResult.status === "succeeded") {
      const { ticketsIssued } = await deps.db.confirmPayment(payment.id);
      log.info("payment_succeeded_sync", { orderId, paymentId: payment.id, ticketsIssued });
      return jsonResponse({ status: "succeeded", orderId: order.id, ticketsIssued });
    } else {
      await deps.db.failPayment(payment.id, "mock provider simulated failure");
      log.info("payment_failed_sync", { orderId, paymentId: payment.id });
      return jsonResponse({ status: "failed", orderId: order.id }, 402);
    }
  }

  log.info("payment_pending_async", { orderId, paymentId: payment.id });
  return jsonResponse({ status: "pending", orderId: order.id, providerReference: initiateResult.providerReference });
}
