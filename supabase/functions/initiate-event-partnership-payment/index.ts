// Location: supabase/functions/initiate-event-partnership-payment/index.ts
// Public function: deploy with --no-verify-jwt; the server validates application state and price.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { createEventPartnershipPaymentDb } from "../_shared/eventPartnershipPaymentDb.ts";
import { loadEventPartnershipMpesaAdapter, requiredEventPartnershipEnv } from "../_shared/eventPartnershipMpesaRuntime.ts";
import { createLogger } from "../_shared/logger.ts";
import { handleInitiateEventPartnershipPayment } from "./handler.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createLogger("initiate-event-partnership-payment", requestId);
  try {
    const url = requiredEventPartnershipEnv("SUPABASE_URL");
    const serviceRole = requiredEventPartnershipEnv("SUPABASE_SERVICE_ROLE_KEY");
    const db = createEventPartnershipPaymentDb(url, serviceRole, createClient);
    const adapter = loadEventPartnershipMpesaAdapter();
    const response = await handleInitiateEventPartnershipPayment(req, { db, adapter });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    logger.error("unhandled_exception", { error: (error as Error).message, stack: (error as Error).stack });
    return new Response(JSON.stringify({ error: "internal error", requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
    });
  }
});
