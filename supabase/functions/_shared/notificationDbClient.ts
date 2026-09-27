import type { NotificationAdapter, NotificationChannel, TicketCode } from "./notificationAdapter.ts";
import type { NotificationDb } from "./notificationDb.ts";

interface ClaimedNotificationRow {
  id: string;
  order_id: string | null;
  channel: NotificationChannel;
  template: string;
  recipient: string | null;
  order_reference: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  event_timezone: string | null;
  venue_name: string | null;
  venue_town: string | null;
  ticket_codes: unknown;
}

function parseTicketCodes(value: unknown): TicketCode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.publicCode !== "string" || typeof row.backupCode !== "string") return [];
    return [{ publicCode: row.publicCode, backupCode: row.backupCode }];
  });
}

/**
 * Service-role-only database access for the worker. The browser never calls
 * these RPCs; both functions are revoked from public/anon/authenticated in
 * migration 0018.
 */
export function createNotificationDbClient(
  supabaseUrl: string,
  serviceRoleKey: string,
  // deno-lint-ignore no-explicit-any
  createClient: (url: string, key: string) => any,
): NotificationDb {
  const client = createClient(supabaseUrl, serviceRoleKey);

  return {
    async claimQueuedNotifications(channel, limit, workerId, leaseSeconds) {
      const { data, error } = await client.rpc("claim_queued_notifications", {
        p_channel: channel,
        p_limit: limit,
        p_worker_id: workerId,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return ((data ?? []) as ClaimedNotificationRow[]).map((row) => ({
        id: row.id,
        orderId: row.order_id,
        channel: row.channel,
        template: row.template,
        recipient: row.recipient,
        orderReference: row.order_reference,
        eventTitle: row.event_title,
        eventStartsAt: row.event_starts_at,
        eventTimezone: row.event_timezone,
        venueName: row.venue_name,
        venueTown: row.venue_town,
        ticketCodes: parseTicketCodes(row.ticket_codes),
      }));
    },
    async markNotificationSent(notificationId, workerId, providerReference, status) {
      const { data, error } = await client.rpc("mark_notification_sent", {
        p_notification_id: notificationId,
        p_worker_id: workerId,
        p_provider_reference: providerReference,
        p_delivery_status: status,
      });
      if (error) throw error;
      return Boolean(data);
    },
    async markNotificationFailed(notificationId, workerId, errorMessage) {
      const { data, error } = await client.rpc("mark_notification_failed", {
        p_notification_id: notificationId,
        p_worker_id: workerId,
        p_error: errorMessage.slice(0, 2000),
      });
      if (error) throw error;
      return Boolean(data);
    },
  };
}

// Keep this import type in the shared client so Deno's isolated type checker
// catches accidental adapter/DB channel drift during local development.
export type NotificationDbChannel = NotificationAdapter["channel"];
