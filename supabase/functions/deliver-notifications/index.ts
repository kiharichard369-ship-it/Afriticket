// Deploy without --no-verify-jwt. Keep this internal worker behind Supabase's
// function auth plus NOTIFICATION_WORKER_SECRET; do not expose it to browsers.
// Required runtime values are documented in supabase/functions/README.md.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { createNotificationDbClient } from "../_shared/notificationDbClient.ts";
import { ResendEmailAdapter, TwilioNotificationAdapter } from "../_shared/notificationProviders.ts";
import type { NotificationAdapter } from "../_shared/notificationAdapter.ts";
import { handleDeliverNotifications } from "./handler.ts";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing required secret: ${name}`);
  return value;
}

function loadAdapters(): Partial<Record<NotificationAdapter["channel"], NotificationAdapter>> {
  const adapters: Partial<Record<NotificationAdapter["channel"], NotificationAdapter>> = {};
  const emailProvider = Deno.env.get("NOTIFICATION_EMAIL_PROVIDER") ?? "disabled";
  const smsProvider = Deno.env.get("NOTIFICATION_SMS_PROVIDER") ?? "disabled";
  const whatsappProvider = Deno.env.get("NOTIFICATION_WHATSAPP_PROVIDER") ?? "disabled";
  const emailApiUrl = Deno.env.get("NOTIFICATION_EMAIL_API_URL");
  const twilioBaseUrl = Deno.env.get("NOTIFICATION_TWILIO_API_URL");

  if (emailProvider === "resend") {
    adapters.email = new ResendEmailAdapter({
      apiKey: required("RESEND_API_KEY"),
      from: required("NOTIFICATION_EMAIL_FROM"),
      baseUrl: emailApiUrl,
    });
  } else if (emailProvider !== "disabled") {
    throw new Error(`unsupported NOTIFICATION_EMAIL_PROVIDER: ${emailProvider}`);
  }

  const twilioConfig = () => ({
    accountSid: required("TWILIO_ACCOUNT_SID"),
    authToken: required("TWILIO_AUTH_TOKEN"),
    from: "",
    baseUrl: twilioBaseUrl,
  });
  if (smsProvider === "twilio") {
    adapters.sms = new TwilioNotificationAdapter("sms", { ...twilioConfig(), from: required("NOTIFICATION_SMS_FROM") });
  } else if (smsProvider !== "disabled") {
    throw new Error(`unsupported NOTIFICATION_SMS_PROVIDER: ${smsProvider}`);
  }
  if (whatsappProvider === "twilio") {
    adapters.whatsapp = new TwilioNotificationAdapter("whatsapp", { ...twilioConfig(), from: required("NOTIFICATION_WHATSAPP_FROM") });
  } else if (whatsappProvider !== "disabled") {
    throw new Error(`unsupported NOTIFICATION_WHATSAPP_PROVIDER: ${whatsappProvider}`);
  }

  if (Object.keys(adapters).length === 0) throw new Error("no notification provider is configured");
  return adapters;
}

function json(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createLogger("deliver-notifications", requestId);
  const configuredSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET");
  if (!configuredSecret) return json({ error: "notification worker is not configured" }, 503, requestId);
  if (req.headers.get("x-worker-secret") !== configuredSecret) return json({ error: "unauthorized" }, 401, requestId);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, requestId);

  try {
    const db = createNotificationDbClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      createClient,
    );
    const response = await handleDeliverNotifications(req, {
      db,
      adapters: loadAdapters(),
      workerId: crypto.randomUUID(),
      leaseSeconds: Number(Deno.env.get("NOTIFICATION_LEASE_SECONDS") ?? "300"),
      logger,
    });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    logger.error("unhandled_exception", { error: error instanceof Error ? error.message : String(error) });
    return json({ error: "notification worker unavailable", requestId }, 503, requestId);
  }
});
