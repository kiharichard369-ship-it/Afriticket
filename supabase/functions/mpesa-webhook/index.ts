// Deployed with: supabase functions deploy mpesa-webhook --no-verify-jwt
// (--no-verify-jwt is required: Safaricom calls this URL with no
// Authorization header at all, so Supabase's default JWT check would
// reject every real callback. Authenticity instead comes from the
// shared-secret path segment checked in MpesaPaymentAdapter.verifyCallback.)
//
// Register this as your Daraja CallBackURL, including the secret segment:
//   https://<project-ref>.supabase.co/functions/v1/mpesa-webhook/<MPESA_WEBHOOK_SECRET>
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { createSupabaseDbClient } from "../_shared/dbClient.ts";
import { MpesaPaymentAdapter } from "../_shared/mpesaProvider.ts";
import { createLogger } from "../_shared/logger.ts";
import { handleMpesaWebhook } from "./handler.ts";

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const requestId = crypto.randomUUID();
  const logger = createLogger("mpesa-webhook", requestId);

  try {
    const db = createSupabaseDbClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, createClient);
    const adapter = new MpesaPaymentAdapter({
      consumerKey: Deno.env.get("MPESA_CONSUMER_KEY")!,
      consumerSecret: Deno.env.get("MPESA_CONSUMER_SECRET")!,
      shortcode: Deno.env.get("MPESA_SHORTCODE")!,
      passkey: Deno.env.get("MPESA_PASSKEY")!,
      baseUrl: Deno.env.get("MPESA_BASE_URL") ?? "https://sandbox.safaricom.co.ke",
      callbackUrl: Deno.env.get("MPESA_CALLBACK_URL")!,
      webhookSecret: Deno.env.get("MPESA_WEBHOOK_SECRET")!,
    });
    return await handleMpesaWebhook(req, { db, adapter, logger });
  } catch (err) {
    logger.error("unhandled_exception", { error: (err as Error).message, stack: (err as Error).stack });
    return new Response(JSON.stringify({ error: "internal error", requestId }), { status: 500, headers: corsHeaders });
  }
});
