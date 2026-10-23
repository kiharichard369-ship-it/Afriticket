// Location: supabase/functions/event-partnership-logo-upload/index.ts
// Public endpoint: deploy with --no-verify-jwt; signed upload tokens are scoped to one private object path.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requiredEventPartnershipEnv } from "../_shared/eventPartnershipMpesaRuntime.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);
  let body: { applicationId?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }
  const applicationId = body.applicationId?.trim() ?? "";
  const extension = EXTENSIONS[body.contentType?.trim() ?? ""];
  if (!UUID_PATTERN.test(applicationId)) return jsonResponse({ error: "applicationId is required" }, 400);
  if (!extension) return jsonResponse({ error: "Choose a JPEG, PNG, or WebP logo." }, 400);

  const requestId = crypto.randomUUID();
  try {
    const client = createClient(requiredEventPartnershipEnv("SUPABASE_URL"), requiredEventPartnershipEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: application, error: lookupError } = await client
      .from("event_partnership_applications")
      .select("id, status, logo_path")
      .eq("id", applicationId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!application) return jsonResponse({ error: "application not found" }, 404);
    if (application.status !== "awaiting_payment" || application.logo_path) {
      return jsonResponse({ error: "This application cannot accept another logo upload." }, 409);
    }

    const path = `${applicationId}/${crypto.randomUUID()}.${extension}`;
    const { data: signed, error: signError } = await client.storage
      .from("event-partner-logos")
      .createSignedUploadUrl(path, { upsert: false });
    if (signError || !signed?.token) throw signError ?? new Error("Signed upload token was not returned");
    const { error: pathError } = await client.rpc("set_event_partnership_logo_path", {
      p_application_id: applicationId,
      p_logo_path: path,
    });
    if (pathError) throw pathError;
    return jsonResponse({ path, token: signed.token, requestId });
  } catch {
    return new Response(JSON.stringify({ error: "A secure logo upload could not be prepared.", requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
    });
  }
});
