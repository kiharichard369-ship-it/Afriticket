// Location: supabase/functions/_shared/eventPartnershipMpesaRuntime.ts
// Shared environment validation for the event partnership M-Pesa functions.
import { MpesaPaymentAdapter } from "./mpesaProvider.ts";

export function requiredEventPartnershipEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value || value.startsWith("replace-with-") || value.includes("<")) {
    throw new Error(`missing production payment secret: ${name}`);
  }
  return value;
}

export function loadEventPartnershipMpesaAdapter(): MpesaPaymentAdapter {
  if (Deno.env.get("PAYMENT_PROVIDER")?.trim() !== "mpesa") {
    throw new Error("PAYMENT_PROVIDER must be explicitly set to mpesa");
  }
  const supabaseUrl = requiredEventPartnershipEnv("SUPABASE_URL");
  const webhookSecret = requiredEventPartnershipEnv("MPESA_WEBHOOK_SECRET");
  const callbackUrl = new URL(
    `/functions/v1/event-partnership-mpesa-webhook/${encodeURIComponent(webhookSecret)}`,
    supabaseUrl,
  ).toString();
  return new MpesaPaymentAdapter({
    consumerKey: requiredEventPartnershipEnv("MPESA_CONSUMER_KEY"),
    consumerSecret: requiredEventPartnershipEnv("MPESA_CONSUMER_SECRET"),
    shortcode: requiredEventPartnershipEnv("MPESA_SHORTCODE"),
    tillNumber: requiredEventPartnershipEnv("MPESA_TILL_NUMBER"),
    passkey: requiredEventPartnershipEnv("MPESA_PASSKEY"),
    baseUrl: requiredEventPartnershipEnv("MPESA_BASE_URL"),
    callbackUrl,
    webhookSecret,
  });
}
