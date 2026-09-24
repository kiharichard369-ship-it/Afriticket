// Deployed with: supabase functions deploy initiate-payment
// Required secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (SUPABASE_URL is auto-injected)
//   PAYMENT_PROVIDER = "mock" | "mpesa"
//   For mpesa: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
//              MPESA_PASSKEY, MPESA_BASE_URL, MPESA_CALLBACK_URL, MPESA_WEBHOOK_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { createSupabaseDbClient } from "../_shared/dbClient.ts";
import { MockPaymentAdapter } from "../_shared/mockPaymentProvider.ts";
import { MpesaPaymentAdapter } from "../_shared/mpesaProvider.ts";
import { createLogger } from "../_shared/logger.ts";
import { handleInitiatePayment } from "./handler.ts";
import type { PaymentAdapter } from "../_shared/paymentAdapter.ts";

function loadAdapter(): PaymentAdapter {
  const provider = Deno.env.get("PAYMENT_PROVIDER") ?? "mock";
  if (provider === "mpesa") {
    return new MpesaPaymentAdapter({
      consumerKey: Deno.env.get("MPESA_CONSUMER_KEY")!,
      consumerSecret: Deno.env.get("MPESA_CONSUMER_SECRET")!,
      shortcode: Deno.env.get("MPESA_SHORTCODE")!,
      passkey: Deno.env.get("MPESA_PASSKEY")!,
      baseUrl: Deno.env.get("MPESA_BASE_URL") ?? "https://sandbox.safaricom.co.ke",
      callbackUrl: Deno.env.get("MPESA_CALLBACK_URL")!,
      webhookSecret: Deno.env.get("MPESA_WEBHOOK_SECRET")!,
    });
  }
  return new MockPaymentAdapter();
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
