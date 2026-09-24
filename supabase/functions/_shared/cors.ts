// ALLOWED_ORIGIN should be set to your deployed frontend's exact origin in
// production (supabase secrets set ALLOWED_ORIGIN=https://ticketyangu.com).
// Falling back to "*" only when it's unset keeps local development working
// without forcing every contributor to configure a secret just to run
// `supabase functions serve`, but shipping to production with it unset
// means any site can call these functions from a browser — set it.
// (mpesa-webhook is called server-to-server by Safaricom, which doesn't
// send an Origin header or honor CORS at all, so this only matters for
// initiate-payment, which browsers call directly.)
const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
