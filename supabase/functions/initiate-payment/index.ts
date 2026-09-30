// Deployed with: supabase functions deploy initiate-payment
// Required secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (SUPABASE_URL is auto-injected)
//   PAYMENT_PROVIDER = "mpesa" (mock exists only in injected tests)
//   For mpesa: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
//              MPESA_TILL_NUMBER,
//              MPESA_PASSKEY, MPESA_BASE_URL, MPESA_CALLBACK_URL, MPESA_WEBHOOK_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { createSupabaseDbClient } from "../_shared/dbClient.ts";
import { MpesaPaymentAdapter } from "../_shared/mpesaProvider.ts";
import { createLogger } from "../_shared/logger.ts";
import { handleInitiatePayment } from "./handler.ts";
import type { PaymentAdapter } from "../_shared/paymentAdapter.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value || value.startsWith("replace-with-") || value.includes("<")) {
    throw new Error(`missing production payment secret: ${name}`);
  }
  return value;
}

function loadAdapter(): PaymentAdapter {
  const provider = Deno.env.get("PAYMENT_PROVIDER")?.trim();
  if (provider !== "mpesa") {
    throw new Error("PAYMENT_PROVIDER must be explicitly set to mpesa; mock is test-only");
  }
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

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createLogger("initiate-payment", requestId);

  try {
    const db = createSupabaseDbClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, createClient);
    const adapter = loadAdapter();
    const response = await handleInitiatePayment(req, { db, adapter, logger });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (err) {
    logger.error("unhandled_exception", { error: (err as Error).message, stack: (err as Error).stack });
    return new Response(JSON.stringify({ error: "internal error", requestId }), {
      status: 500,
      headers: { ...corsHeaders, "x-request-id": requestId },
    });
  }
});
