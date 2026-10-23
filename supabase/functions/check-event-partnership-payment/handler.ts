// Location: supabase/functions/check-event-partnership-payment/handler.ts
// Server-side reconciliation for anonymous event partnership checkout.
import { jsonResponse } from "../_shared/cors.ts";
import type { EventPartnershipPaymentDb } from "../_shared/eventPartnershipPaymentDb.ts";
import type { PaymentAdapter } from "../_shared/paymentAdapter.ts";

export interface CheckEventPartnershipDeps {
  db: EventPartnershipPaymentDb;
  adapter: PaymentAdapter;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleCheckEventPartnershipPayment(req: Request, deps: CheckEventPartnershipDeps): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);
  let body: { applicationId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  const applicationId = body.applicationId?.trim() ?? "";
  if (!UUID_PATTERN.test(applicationId)) return jsonResponse({ error: "applicationId is required" }, 400);

  const application = await deps.db.getApplication(applicationId);
  if (!application) return jsonResponse({ error: "application not found" }, 404);
  if (application.status === "paid") return jsonResponse({ status: "succeeded", applicationId });
  if (application.status !== "awaiting_payment") return jsonResponse({ status: "failed", applicationId });

  const payment = await deps.db.findLatestPayment(applicationId);
  if (!payment) return jsonResponse({ status: "pending", applicationId });
  if (payment.status === "succeeded") return jsonResponse({ status: "succeeded", applicationId });
  if (payment.status === "failed") return jsonResponse({ status: "failed", applicationId });
  if (payment.status !== "pending" || !payment.provider_reference) {
    return jsonResponse({ status: "pending", applicationId });
  }

  const allowed = await deps.db.checkRateLimit(`event_partnership_status:${applicationId}`, 12, "1 minute");
  if (!allowed) return jsonResponse({ status: "pending", applicationId, retryAfterSeconds: 5 }, 429);

  const result = await deps.adapter.query(payment.provider_reference);
  if (result.status === "succeeded") {
    await deps.db.confirmPayment(payment.id);
    return jsonResponse({ status: "succeeded", applicationId });
  }
  if (result.status === "failed") {
    await deps.db.failPayment(payment.id, "Safaricom reports that the payment was not completed");
    return jsonResponse({ status: "failed", applicationId });
  }
  return jsonResponse({ status: "pending", applicationId });
}
