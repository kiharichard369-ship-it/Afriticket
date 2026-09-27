import type { NotificationChannel, NotificationPayload } from "./notificationAdapter.ts";

export interface NotificationDb {
  claimQueuedNotifications(
    channel: NotificationChannel,
    limit: number,
    workerId: string,
    leaseSeconds: number,
  ): Promise<NotificationPayload[]>;
  /** Returns false when this worker no longer owns the lease or the row is not queued. */
  markNotificationSent(
    notificationId: string,
    workerId: string,
    providerReference: string | null,
    status: "sent" | "delivered",
  ): Promise<boolean>;
  /** Returns false when this worker no longer owns the lease or the row is terminal. */
  markNotificationFailed(notificationId: string, workerId: string, error: string): Promise<boolean>;
}
