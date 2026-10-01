import { renderNotification } from "./notificationAdapter.ts";

function assertIncludes(value: string, expected: string) {
  if (!value.includes(expected)) throw new Error(`expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
}

Deno.test("ticket confirmation email includes entry and backup codes without requiring an account", () => {
  const message = renderNotification({
    id: "notification-1",
    orderId: "order-1",
    channel: "email",
    template: "ticket_confirmation",
    recipient: "guest@example.test",
    orderReference: "AT-ABC123",
    eventTitle: "Weekend Edition",
    eventStartsAt: "2026-10-01T17:00:00Z",
    eventTimezone: "Africa/Nairobi",
    venueName: "Nyayo Stadium",
    venueTown: "Nairobi",
    ticketCodes: [{ publicCode: "PUBLIC123", backupCode: "BACKUP123" }],
  });

  assertIncludes(message.subject, "Weekend Edition");
  assertIncludes(message.text, "PUBLIC123");
  assertIncludes(message.text, "BACKUP123");
  assertIncludes(message.text, "No Afriticket login is required for entry");
  assertIncludes(message.html, "PUBLIC123");
});
