// Location: supabase/functions/check-event-partnership-payment/index.ts
// Public status endpoint: deploy with --no-verify-jwt; it returns no applicant PII.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { createEventPartnershipPaymentDb } from "../_shared/eventPartnershipPaymentDb.ts";
import { loadEventPartnershipMpesaAdapter, requiredEventPartnershipEnv } from "../_shared/eventPartnershipMpesaRuntime.ts";
import { createLogger } from "../_shared/logger.ts";
import { handleCheckEventPartnershipPayment } from "./handler.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createLogger("check-event-partnership-payment", requestId);
  try {
    const url = requiredEventPartnershipEnv("SUPABASE_URL");
    const serviceRole = requiredEventPartnershipEnv("SUPABASE_SERVICE_ROLE_KEY");
    const db = createEventPartnershipPaymentDb(url, serviceRole, createClient);
    const adapter = loadEventPartnershipMpesaAdapter();
    const response = await handleCheckEventPartnershipPayment(req, { db, adapter });
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
