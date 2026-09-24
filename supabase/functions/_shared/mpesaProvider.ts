import type { CallbackVerification, InitiateParams, InitiateResult, PaymentAdapter, QueryResult, RefundResult } from "./paymentAdapter.ts";

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  /** e.g. https://sandbox.safaricom.co.ke — injectable so tests point at a fake local server instead. */
  baseUrl: string;
  /** Full callback URL Safaricom will POST to, including the shared-secret path segment. */
  callbackUrl: string;
  /** The same secret segment, checked again on the inbound callback in verifyCallback. */
  webhookSecret: string;
}

function timestampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toBase64(input: string): string {
  return btoa(input);
}

/** Extracts a named field from Daraja's CallbackMetadata.Item array shape. */
function metadataValue(items: Array<{ Name: string; Value?: unknown }> | undefined, name: string): unknown {
  return items?.find((i) => i.Name === name)?.Value;
}

export class MpesaPaymentAdapter implements PaymentAdapter {
  readonly name = "mpesa";
  constructor(private config: MpesaConfig) {}

  private async getAccessToken(): Promise<string> {
    const credentials = toBase64(`${this.config.consumerKey}:${this.config.consumerSecret}`);
    const res = await fetch(`${this.config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!res.ok) throw new Error(`M-Pesa auth failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.access_token;
  }

  private passwordAndTimestamp() {
    const timestamp = timestampNow();
    const password = toBase64(`${this.config.shortcode}${this.config.passkey}${timestamp}`);
    return { password, timestamp };
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    if (!params.phoneNumber) throw new Error("phoneNumber is required for M-Pesa STK push");
    const token = await this.getAccessToken();
    const { password, timestamp } = this.passwordAndTimestamp();

    const res = await fetch(`${this.config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(params.amountMinor / 100),
        PartyA: params.phoneNumber,
        PartyB: this.config.shortcode,
        PhoneNumber: params.phoneNumber,
        CallBackURL: this.config.callbackUrl,
        AccountReference: params.orderReference,
        TransactionDesc: `Ticketyangu order ${params.orderReference}`,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.ResponseCode !== "0") {
      throw new Error(`STK push rejected: ${data.errorMessage ?? data.ResponseDescription ?? res.status}`);
    }

    return {
      providerReference: data.CheckoutRequestID,
      status: "pending",
      resolvedImmediately: false,
      raw: data,
    };
  }

  async query(providerReference: string): Promise<QueryResult> {
    const token = await this.getAccessToken();
    const { password, timestamp } = this.passwordAndTimestamp();

    const res = await fetch(`${this.config.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: providerReference,
      }),
    });
    const data = await res.json();
    const status = data.ResultCode === 0 ? "succeeded" : data.ResultCode === undefined ? "pending" : "failed";
    return { providerReference, status, raw: data };
  }

  async verifyCallback(req: Request, rawBody: string): Promise<CallbackVerification> {
    // Daraja doesn't sign callbacks, so authenticity relies on the
    // shared-secret path segment in the URL we registered as CallBackURL —
    // see mpesa-webhook/index.ts for where this is checked against the URL.
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const providedSecret = segments[segments.length - 1];
    const isAuthentic = providedSecret === this.config.webhookSecret;

    const body = JSON.parse(rawBody);
    const callback = body?.Body?.stkCallback;
    if (!callback) {
      return { isAuthentic: false, providerEventId: "unknown", providerReference: "unknown", status: "failed" };
    }

    const succeeded = callback.ResultCode === 0;
    const items = callback.CallbackMetadata?.Item as Array<{ Name: string; Value?: unknown }> | undefined;

    return {
      isAuthentic,
      // MerchantRequestID + CheckoutRequestID together uniquely identify one callback delivery.
      providerEventId: `${callback.MerchantRequestID}:${callback.CheckoutRequestID}`,
      providerReference: callback.CheckoutRequestID,
      status: succeeded ? "succeeded" : "failed",
      failureReason: succeeded ? undefined : callback.ResultDesc,
      // Exposed for the caller if it wants receipt/phone/amount details:
      ...(succeeded
        ? {
            raw: {
              mpesaReceiptNumber: metadataValue(items, "MpesaReceiptNumber"),
              amount: metadataValue(items, "Amount"),
              phoneNumber: metadataValue(items, "PhoneNumber"),
            },
          }
        : {}),
    } as CallbackVerification;
  }

  async refund(providerReference: string, _amountMinor: number): Promise<RefundResult> {
    // Daraja's B2C reversal API needs its own security-credential setup
    // (a separate certificate-encrypted credential, not just consumer
    // key/secret) — deliberately not implemented until that's confirmed
    // as a product decision, per the "ask only when it changes money
    // movement" rule. Refunds today are handled as a manual payout
    // outside the app; approve_refund() still records the decision.
    throw new Error("M-Pesa refund API is not wired up yet — process this refund manually and record it once sent.");
  }
}
