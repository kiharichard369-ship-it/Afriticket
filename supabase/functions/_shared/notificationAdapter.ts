export type NotificationChannel = "email" | "sms" | "whatsapp";

export interface TicketCode {
  publicCode: string;
  backupCode: string;
}

export interface NotificationPayload {
  id: string;
  orderId: string | null;
  channel: NotificationChannel;
  template: string;
  recipient: string | null;
  orderReference: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  eventTimezone: string | null;
  venueName: string | null;
  venueTown: string | null;
  ticketCodes: TicketCode[];
}

export interface NotificationMessage {
  subject: string;
  text: string;
  html: string;
}

export interface NotificationDeliveryResult {
  providerReference: string | null;
  status: "sent" | "delivered";
}

export interface NotificationAdapter {
  readonly channel: NotificationChannel;
  deliver(payload: NotificationPayload, idempotencyKey: string): Promise<NotificationDeliveryResult>;
}

export function renderNotification(payload: NotificationPayload): NotificationMessage {
  if (payload.template !== "ticket_confirmation") {
    throw new Error(`unsupported notification template: ${payload.template}`);
  }

  const eventTitle = payload.eventTitle ?? "your event";
  const orderReference = payload.orderReference ?? payload.orderId ?? payload.id;
  const start = payload.eventStartsAt
    ? new Date(payload.eventStartsAt).toLocaleString("en-KE", {
      timeZone: payload.eventTimezone ?? "Africa/Nairobi",
      dateStyle: "medium",
      timeStyle: "short",
    })
    : "the scheduled event time";
  const venue = [payload.venueName, payload.venueTown].filter(Boolean).join(", ") || "the event venue";
  const codes = payload.ticketCodes.length > 0
    ? payload.ticketCodes.map((ticket, index) => `${index + 1}. ${ticket.publicCode} (backup: ${ticket.backupCode})`).join("\n")
    : "Your ticket details are available in your Afriticket account.";

  const text = [
    `Your Afriticket tickets for ${eventTitle}`,
    `Order: ${orderReference}`,
    `When: ${start}`,
    `Where: ${venue}`,
    "",
    codes,
  ].join("\n");

  const escapeHtml = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const html = `<h1>Your Afriticket tickets</h1><p><strong>${escapeHtml(eventTitle)}</strong></p><p>Order: ${escapeHtml(orderReference)}<br>When: ${escapeHtml(start)}<br>Where: ${escapeHtml(venue)}</p><pre>${escapeHtml(codes)}</pre>`;

  return { subject: `Your Afriticket tickets — ${eventTitle}`, text, html };
}
