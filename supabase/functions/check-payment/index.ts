// Save as: supabase/functions/check-payment/index.ts
// Deploy:  supabase functions deploy check-payment
// (Keep JWT verification ON — the default. Do NOT use --no-verify-jwt.)
//
// The checkout dialog calls this every few seconds while a payment is pending.
// It asks Safaricom directly whether the STK push succeeded and, if so, issues
// the tickets right away instead of waiting for the callback. It is safe to
// race with the webhook: confirm_payment_and_issue_tickets is idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseDbClient } from "../_shared/dbClient.ts";
import { MpesaPaymentAdapter } from "../_shared/mpesaProvider.ts";
import { createLogger } from "../_shared/logger.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value || value.startsWith("replace-with-") || value.includes("<")) {
    throw new Error(`missing production payment secret: ${name}`);
  }
  return value;
}

function loadAdapter() {
  return new MpesaPaymentAdapter({
    consumerKey: requiredEnv("MPESA_CONSUMER_KEY"),
    consumerSecret: requiredEnv("MPESA_CONSUMER_SECRET"),
    shortcode: requiredEnv("MPESA_SHORTCODE"),
    tillNumber: requiredEnv("MPESA_TILL_NUMBER"),
    passkey: requiredEnv("MPESA_PASSKEY"),
    baseUrl: requiredEnv("MPESA_BASE_URL"),
    callbackUrl: requiredEnv("MPESA_CALLBACK_URL"),
    webhookSecret: requiredEnv("MPESA_WEBHOOK_SECRET"),
  });
}

// Daraja's query API is rate limited and shared by every payment on your app,
// so never query the same order more than once every 3 seconds per instance.
const lastQueried = new Map<string, number>();
const MIN_GAP_MS = 3000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createLogger("check-payment", requestId);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const service = createClient(supabaseUrl, serviceKey);

    // Who is asking? (Guests have an anonymous session, which counts.)
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "authentication required" }, 401);
    const { data: { user }, error: authError } = await service.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    if (!UUID.test(orderId)) return jsonResponse({ error: "invalid orderId" }, 400);

    // Only the buyer of this order may check it.
    const { data: order, error: orderError } = await service
      .from("orders").select("id, status, buyer_id").eq("id", orderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.buyer_id !== user.id) return jsonResponse({ error: "order not found" }, 404);

    if (order.status === "paid") return jsonResponse({ status: "succeeded" });
    if (order.status === "failed") return jsonResponse({ status: "failed" });

    const { data: payment, error: paymentError } = await service
      .from("payments")
      .select("id, provider_reference, status")
      .eq("order_id", orderId)
      .eq("provider", "mpesa")
      .order("initiated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return jsonResponse({ status: "pending" });
    if (payment.status === "succeeded") return jsonResponse({ status: "succeeded" });
    if (payment.status === "failed") return jsonResponse({ status: "failed" });

    const now = Date.now();
    if (now - (lastQueried.get(payment.id) ?? 0) < MIN_GAP_MS) return jsonResponse({ status: "pending" });
    lastQueried.set(payment.id, now);

    const result = await loadAdapter().query(payment.provider_reference);
    const db = createSupabaseDbClient(supabaseUrl, serviceKey, createClient);

    if (result.status === "succeeded") {
      const issued = await db.confirmPayment(payment.id);
      logger.info("payment_confirmed_by_query", { paymentId: payment.id, orderId });
      return jsonResponse({ status: "succeeded", ticketsIssued: issued.ticketsIssued });
    }
    if (result.status === "failed") {
      await db.failPayment(payment.id, "payment query reported failure");
      logger.info("payment_failed_by_query", { paymentId: payment.id, orderId });
      return jsonResponse({ status: "failed" });
    }
    return jsonResponse({ status: "pending" });
  } catch (err) {
    logger.error("check_payment_failed", { error: err instanceof Error ? err.message : String(err) });
    // The dialog treats this as "try again on the next tick".
    return jsonResponse({ error: "verification temporarily unavailable", requestId }, 503);
  }
});