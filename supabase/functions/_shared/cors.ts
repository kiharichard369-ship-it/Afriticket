// ALLOWED_ORIGIN should be set to the exact frontend origin, for example
// http://localhost:5173 during local development or https://afriticket.com
// in production. Never include a path, trailing slash, or angle brackets.
// (mpesa-webhook is called server-to-server by Safaricom, which doesn't
// send an Origin header or honor CORS at all, so this only matters for
// initiate-payment, which browsers call directly.)
const configuredOrigin = Deno.env.get("ALLOWED_ORIGIN")?.trim() ?? "";

function isValidOrigin(value: string) {
  if (!value || value.includes("<") || value.includes(">") || value.includes("your-")) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.pathname.replace(/\/$/, "") && !url.search && !url.hash;
  } catch {
    return false;
  }
}

// An invalid or unset value falls back to wildcard rather than emitting an
// invalid Access-Control-Allow-Origin header that browsers reject outright.
// Production deployments should always set a real exact origin.
const allowedOrigin = isValidOrigin(configuredOrigin) ? configuredOrigin : "*";

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
