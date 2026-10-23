// Location: supabase/functions/initiate-event-partnership-payment/handler.ts
// Public request handler; prices and payment eligibility come only from the database.
import { jsonResponse } from "../_shared/cors.ts";
import type { EventPartnershipPaymentDb, EventPartnershipPaymentRow } from "../_shared/eventPartnershipPaymentDb.ts";
import type { InitiateResult, PaymentAdapter } from "../_shared/paymentAdapter.ts";

export interface InitiateEventPartnershipDeps {
  db: EventPartnershipPaymentDb;
  adapter: PaymentAdapter;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleInitiateEventPartnershipPayment(req: Request, deps: InitiateEventPartnershipDeps): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);
  let body: { applicationId?: string; phoneNumber?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  const applicationId = body.applicationId?.trim() ?? "";
  const phoneNumber = body.phoneNumber?.trim() ?? "";
  if (!UUID_PATTERN.test(applicationId)) return jsonResponse({ error: "applicationId is required" }, 400);
  if (!phoneNumber) return jsonResponse({ error: "phoneNumber is required" }, 400);

  const application = await deps.db.getApplication(applicationId);
  if (!application) return jsonResponse({ error: "application not found" }, 404);
  if (application.status === "paid") return jsonResponse({ status: "succeeded", applicationId });
  if (application.status !== "awaiting_payment") return jsonResponse({ error: "application is not payable" }, 409);

  let payment: EventPartnershipPaymentRow;
  try {
    payment = await deps.db.reservePaymentAttempt(applicationId);
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (message.includes("application_already_paid")) return jsonResponse({ status: "succeeded", applicationId });
    if (message.includes("application_not_payable")) return jsonResponse({ error: "application is not payable" }, 409);
    if (message.includes("payment_initiation_in_progress")) return jsonResponse({ error: "A payment request is already being prepared. Please wait a moment." }, 409);
    throw error;
  }

  if (payment.status === "pending" && payment.provider_reference) {
    return jsonResponse({ status: "pending", applicationId });
  }
  if (payment.status !== "initiated" || payment.provider_reference) {
    return jsonResponse({ error: "A payment attempt is already in progress." }, 409);
  }

  let initiation: InitiateResult;
  try {
    initiation = await deps.adapter.initiate({
      orderId: applicationId,
      orderReference: application.public_reference,
      amountMinor: Number(payment.amount_minor),
      currency: "KES",
      phoneNumber,
    });
  } catch (error) {
    await deps.db.failPayment(payment.id, (error as Error).message || "M-Pesa initiation failed").catch(() => undefined);
    return jsonResponse({ error: "M-Pesa could not start the payment. Check the phone number and try again." }, 502);
  }

  try {
    await deps.db.recordPaymentInitiation(payment.id, initiation.providerReference);
  } catch {
    // The provider may already have sent an STK prompt. Keep the reservation
    // open so another request cannot start a duplicate charge immediately.
    return jsonResponse({ error: "The M-Pesa request may be processing. Do not retry immediately; wait for confirmation or try again in a few minutes." }, 503);
  }
  if (initiation.resolvedImmediately && initiation.status === "succeeded") {
    await deps.db.confirmPayment(payment.id);
    return jsonResponse({ status: "succeeded", applicationId });
  }
  if (initiation.resolvedImmediately && initiation.status === "failed") {
    await deps.db.failPayment(payment.id, "M-Pesa reported that the payment did not complete");
    return jsonResponse({ status: "failed", applicationId });
  }
  return jsonResponse({ status: "pending", applicationId });
}
