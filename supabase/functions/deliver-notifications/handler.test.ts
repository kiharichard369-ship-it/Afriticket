import { handleDeliverNotifications } from "./handler.ts";
import type { NotificationAdapter, NotificationPayload } from "../_shared/notificationAdapter.ts";
import type { NotificationDb } from "../_shared/notificationDb.ts";

function assertEquals<T>(actual: T, expected: T, message?: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(message ?? `expected ${expectedJson}, got ${actualJson}`);
}

function payload(id: string, channel: "email" | "sms" = "email"): NotificationPayload {
  return {
    id,
    orderId: "order-1",
    channel,
    template: "ticket_confirmation",
    recipient: channel === "email" ? "buyer@example.test" : "254700000001",
    orderReference: "TY-ABC123",
    eventTitle: "Test event",
    eventStartsAt: "2026-10-01T17:00:00Z",
    eventTimezone: "Africa/Nairobi",
    venueName: "Test venue",
    venueTown: "Nakuru",
    ticketCodes: [{ publicCode: "PUBLIC1", backupCode: "BACKUP1" }],
  };
}

class FakeDb implements NotificationDb {
  readonly rows = new Map<string, { notification: NotificationPayload; status: "queued" | "sent" | "failed"; workerId?: string }>();

  add(notification: NotificationPayload) {
    this.rows.set(notification.id, { notification, status: "queued" });
  }

  async claimQueuedNotifications(channel: NotificationPayload["channel"], limit: number, workerId: string) {
    return [...this.rows.values()]
      .filter((row) => row.notification.channel === channel && row.status === "queued")
      .slice(0, limit)
      .map((row) => {
        row.workerId = workerId;
        return row.notification;
      });
  }

  async markNotificationSent(id: string, workerId: string) {
    const row = this.rows.get(id);
    if (!row || row.workerId !== workerId) return false;
    if (row.status === "sent") return true;
    if (row.status !== "queued") return false;
    row.status = "sent";
    return true;
  }

  async markNotificationFailed(id: string, workerId: string) {
    const row = this.rows.get(id);
    if (!row || row.workerId !== workerId) return false;
    if (row.status === "failed") return true;
    if (row.status !== "queued") return false;
    row.status = "failed";
    return true;
  }
}

function adapter(channel: "email" | "sms", deliver: NotificationAdapter["deliver"]): NotificationAdapter {
  return { channel, deliver };
}

Deno.test("deliver-notifications: successful provider call is marked once and retry is a no-op", async () => {
  const db = new FakeDb();
  db.add(payload("notification-1"));
  let calls = 0;
  const email = adapter("email", async (_notification, idempotencyKey) => {
    calls += 1;
    assertEquals(idempotencyKey, "notification-1");
    return { providerReference: "provider-1", status: "sent" };
  });

  const deps = { db, adapters: { email }, workerId: "worker-1" };
  const first = await handleDeliverNotifications(new Request("http://worker", { method: "POST", body: "{}" }), deps);
  const second = await handleDeliverNotifications(new Request("http://worker", { method: "POST", body: "{}" }), deps);

  assertEquals((await first.json()).sent, 1);
  assertEquals((await second.json()).claimed, 0);
  assertEquals(calls, 1);
  assertEquals(db.rows.get("notification-1")?.status, "sent");
});

Deno.test("deliver-notifications: provider failure becomes a terminal failed state", async () => {
  const db = new FakeDb();
  db.add(payload("notification-2"));
  const email = adapter("email", async () => {
    throw new Error("provider unavailable");
  });

  const response = await handleDeliverNotifications(
    new Request("http://worker", { method: "POST", body: JSON.stringify({ channel: "email" }) }),
    { db, adapters: { email }, workerId: "worker-2" },
  );

  assertEquals((await response.json()).failed, 1);
  assertEquals(db.rows.get("notification-2")?.status, "failed");
});

Deno.test("deliver-notifications: configured channel filter does not claim another channel", async () => {
  const db = new FakeDb();
  db.add(payload("notification-email", "email"));
  db.add(payload("notification-sms", "sms"));
  const email = adapter("email", async () => ({ providerReference: null, status: "delivered" }));

  const response = await handleDeliverNotifications(
    new Request("http://worker", { method: "POST", body: JSON.stringify({ channel: "email", limit: 10 }) }),
    { db, adapters: { email }, workerId: "worker-3" },
  );

  assertEquals((await response.json()).sent, 1);
  assertEquals(db.rows.get("notification-sms")?.status, "queued");
});
