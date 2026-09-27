import {
  renderNotification,
  type NotificationAdapter,
  type NotificationChannel,
  type NotificationPayload,
  type NotificationDeliveryResult,
} from "./notificationAdapter.ts";

interface ResendConfig {
  apiKey: string;
  from: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class ResendEmailAdapter implements NotificationAdapter {
  readonly channel = "email" as const;
  private readonly config: ResendConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: ResendConfig) {
    this.config = config;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async deliver(payload: NotificationPayload, idempotencyKey: string): Promise<NotificationDeliveryResult> {
    if (!payload.recipient) throw new Error("email notification has no recipient");
    const message = renderNotification(payload);
    const response = await this.fetchFn(`${this.config.baseUrl ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        // Resend supports this key for safe retries of the same API request.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [payload.recipient],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) throw new Error(`email provider returned HTTP ${response.status}: ${await response.text()}`);
    const body = await response.json().catch(() => ({})) as { id?: string };
    return { providerReference: body.id ?? idempotencyKey, status: "sent" };
  }
}

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class TwilioNotificationAdapter implements NotificationAdapter {
  readonly channel: NotificationChannel;
  private readonly config: TwilioConfig;
  private readonly fetchFn: typeof fetch;

  constructor(channel: "sms" | "whatsapp", config: TwilioConfig) {
    this.channel = channel;
    this.config = config;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async deliver(payload: NotificationPayload, idempotencyKey: string): Promise<NotificationDeliveryResult> {
    if (!payload.recipient) throw new Error(`${this.channel} notification has no recipient`);
    const message = renderNotification(payload);
    const endpoint = `${this.config.baseUrl ?? "https://api.twilio.com"}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;
    const form = new URLSearchParams({ To: payload.recipient, From: this.config.from, Body: message.text });
    const response = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.config.accountSid}:${this.config.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Keep the queue key visible to providers that support request idempotency.
        "Idempotency-Key": idempotencyKey,
      },
      body: form.toString(),
    });
    if (!response.ok) throw new Error(`Twilio returned HTTP ${response.status}: ${await response.text()}`);
    const body = await response.json().catch(() => ({})) as { sid?: string };
    return { providerReference: body.sid ?? idempotencyKey, status: "sent" };
  }
}
