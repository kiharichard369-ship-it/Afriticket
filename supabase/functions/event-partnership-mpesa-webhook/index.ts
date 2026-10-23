// Location: supabase/functions/event-partnership-mpesa-webhook/index.ts
// Daraja calls this public endpoint without JWT; callback authenticity uses the existing shared-secret path.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { createEventPartnershipPaymentDb } from "../_shared/eventPartnershipPaymentDb.ts";
import { loadEventPartnershipMpesaAdapter, requiredEventPartnershipEnv } from "../_shared/eventPartnershipMpesaRuntime.ts";
import { createLogger } from "../_shared/logger.ts";
import { handleEventPartnershipMpesaWebhook } from "./handler.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const requestId = crypto.randomUUID();
  const logger = createLogger("event-partnership-mpesa-webhook", requestId);
  try {
    const url = requiredEventPartnershipEnv("SUPABASE_URL");
    const serviceRole = requiredEventPartnershipEnv("SUPABASE_SERVICE_ROLE_KEY");
    const db = createEventPartnershipPaymentDb(url, serviceRole, createClient);
    const adapter = loadEventPartnershipMpesaAdapter();
    return await handleEventPartnershipMpesaWebhook(req, { db, adapter });
  } catch (error) {
    logger.error("unhandled_exception", { error: (error as Error).message, stack: (error as Error).stack });
    return new Response(JSON.stringify({ error: "internal error", requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
    });
  }
});
