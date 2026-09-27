import type { Logger } from "../_shared/logger.ts";
import type { NotificationAdapter, NotificationChannel } from "../_shared/notificationAdapter.ts";
import type { NotificationDb } from "../_shared/notificationDb.ts";

const channels: NotificationChannel[] = ["email", "sms", "whatsapp"];

export interface NotificationHandlerDependencies {
  db: NotificationDb;
  adapters: Partial<Record<NotificationChannel, NotificationAdapter>>;
  workerId: string;
  leaseSeconds?: number;
  logger?: Logger;
}

interface DeliveryRequest {
  channel?: NotificationChannel;
  limit?: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function parseRequestBody(raw: string): DeliveryRequest {
  if (!raw.trim()) return {};
  const value = JSON.parse(raw) as Record<string, unknown>;
  const channel = value.channel;
  if (channel !== undefined && !channels.includes(channel as NotificationChannel)) {
    throw new Error("channel must be email, sms, or whatsapp");
  }
  const limit = value.limit;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  return { channel: channel as NotificationChannel | undefined, limit: limit as number | undefined };
}

/**
 * Pure orchestration boundary: all database and provider effects are injected,
 * so this function can be tested without credentials or a Supabase project.
 */
export async function handleDeliverNotifications(
  req: Request,
  dependencies: NotificationHandlerDependencies,
): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  let body: DeliveryRequest;
  try {
    body = parseRequestBody(await req.text());
  } catch (error) {
    return jsonResponse({ error: (error as Error).message || "invalid JSON" }, 400);
  }

  const selectedChannels = body.channel ? [body.channel] : channels.filter((channel) => dependencies.adapters[channel]);
  if (selectedChannels.length === 0 || selectedChannels.some((channel) => !dependencies.adapters[channel])) {
    return jsonResponse({ error: "no notification provider is configured" }, 503);
  }

  const limit = body.limit ?? 20;
  const leaseSeconds = dependencies.leaseSeconds ?? 300;
  const result = {
    workerId: dependencies.workerId,
    claimed: 0,
    sent: 0,
    failed: 0,
    claimLost: 0,
    channels: selectedChannels,
  };

  for (const channel of selectedChannels) {
    const adapter = dependencies.adapters[channel];
    if (!adapter) continue;
    const notifications = await dependencies.db.claimQueuedNotifications(channel, limit, dependencies.workerId, leaseSeconds);
    result.claimed += notifications.length;

    for (const notification of notifications) {
      try {
        const delivery = await adapter.deliver(notification, notification.id);
        const marked = await dependencies.db.markNotificationSent(
          notification.id,
          dependencies.workerId,
          delivery.providerReference,
          delivery.status,
        );
        if (marked) result.sent += 1;
        else {
          result.claimLost += 1;
          dependencies.logger?.warn("notification_claim_lost_after_provider_delivery", { notificationId: notification.id, channel });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          const marked = await dependencies.db.markNotificationFailed(notification.id, dependencies.workerId, message);
          if (marked) result.failed += 1;
          else result.claimLost += 1;
        } catch (markError) {
          result.claimLost += 1;
          dependencies.logger?.error("notification_failure_state_write_failed", {
            notificationId: notification.id,
            error: markError instanceof Error ? markError.message : String(markError),
          });
        }
        dependencies.logger?.error("notification_provider_delivery_failed", { notificationId: notification.id, channel, error: message });
      }
    }
  }

  return jsonResponse(result);
}
