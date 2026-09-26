const FAQS = [
  {
    q: "How do I buy a ticket?",
    a: "Browse events on the home page, open the one you want, choose a ticket type and quantity, and pay with M-Pesa. Your ticket — with a QR code — appears under \"My tickets\" as soon as payment is confirmed.",
  },
  {
    q: "Where do I find my ticket after buying it?",
    a: "Log in and go to \"My tickets\" from the menu. Each ticket shows a QR code and a backup code in case the QR won't scan at the door.",
  },
  {
    q: "Can I get a refund?",
    a: "Open \"My tickets\", find the order, and use \"Request refund\". The organiser or our team reviews the request — approved refunds are processed according to the event's refund policy.",
  },
  {
    q: "How do I become an organiser and sell tickets?",
    a: "Click \"Sell tickets\", log in or create an account, and fill in the short application form. Our team reviews applications before approving them.",
  },
  {
    q: "I'm an organiser — how does check-in work on the day?",
    a: "From your organiser dashboard, click \"Check-in\" next to a published event, then type or scan each guest's ticket code at the door.",
  },
];

export function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-4xl font-semibold text-ink dark:text-ink-dark">Support centre</h1>
      <p className="mt-3 text-ink-soft dark:text-ink-soft-dark">
        Answers to the most common questions. Still stuck? Reach us directly at{" "}
        <a href="mailto:afriticket@gmail.com" className="font-medium text-saffron-text hover:underline dark:text-saffron">
          afriticket@gmail.com
        </a>{" "}
        or{" "}
        <a href="tel:0115577319" className="font-medium text-saffron-text hover:underline dark:text-saffron">
          0115 577 319
        </a>
        .
      </p>

      <div className="mt-8 space-y-6">
        {FAQS.map((item) => (
          <div key={item.q}>
            <h2 className="font-display text-lg font-semibold text-ink dark:text-ink-dark">{item.q}</h2>
            <p className="mt-1 leading-relaxed text-ink-soft dark:text-ink-soft-dark">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
